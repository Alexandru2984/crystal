require "kemal"
require "json"
require "socket"

# Setup logging
log_file = File.new("logs/app.log", "a")
log_file.sync = true
logger = Kemal::LogHandler.new(log_file)
Kemal.config.add_handler logger
Kemal.config.env = "production"

def app_log(msg)
  puts "[#{Time.local}] #{msg}"
  File.open("logs/app.log", "a") do |f|
    f.puts "[#{Time.local}] #{msg}"
  end
end

SOCKETS = [] of HTTP::WebSocket

ACCESS_LOG_REGEX = /^(\S+) \S+ \S+ \[[^\]]+\] "(?:\S+) (\S+) \S+" (\d+) \d+ "[^"]*" "([^"]*)"/

def send_initial_data(socket : HTTP::WebSocket)
  begin
    output = `tail -n 200 /var/log/nginx/access.log`
    output.each_line do |line|
      if match = ACCESS_LOG_REGEX.match(line)
        data = {
          type: "access",
          ip: match[1],
          path: match[2],
          status: match[3].to_i,
          user_agent: match[4]
        }
        socket.send(data.to_json)
      end
    end
    
    error_output = `tail -n 20 /var/log/nginx/error.log`
    error_output.each_line do |line|
      data = {type: "error", message: line}
      socket.send(data.to_json)
    end
  rescue ex
    app_log "Error sending initial data: #{ex.message}"
  end
end

before_all do |env|
  path = env.request.path
  if path != "/login" && path != "/style.css" && path != "/app.js" && path != "/favicon.ico"
    cookie = env.request.cookies["auth"]?
    if cookie.nil? || cookie.value != "supersecrettoken"
      if path == "/live"
        halt env, 403, "Forbidden"
      else
        env.redirect "/login"
        halt env, 403, "Forbidden"
      end
    end
  end
end

get "/login" do |env|
  env.response.content_type = "text/html"
  File.read("./src/login.html")
end

post "/login" do |env|
  username = env.params.body["username"]?
  password = env.params.body["password"]?
  
  if username == "admin" && password == "CrystalLogs2026"
    env.response.cookies << HTTP::Cookie.new("auth", "supersecrettoken", path: "/", http_only: true)
    env.redirect "/"
  else
    env.response.content_type = "text/html"
    File.read("./src/login.html").sub(%{<div class="error-msg" id="error-msg">}, %{<div class="error-msg" id="error-msg" style="display:block;">})
  end
end

get "/logout" do |env|
  env.response.cookies << HTTP::Cookie.new("auth", "", path: "/", http_only: true, expires: Time.utc(1970, 1, 1))
  env.redirect "/login"
end

ws "/live" do |socket|
  SOCKETS << socket
  send_initial_data(socket)
  socket.on_close do
    SOCKETS.delete socket
  end
end

Kemal.config.public_folder = "./public"

get "/" do |env|
  env.response.content_type = "text/html"
  File.read("./src/index.html")
end

get "/index.html" do |env|
  env.redirect "/"
end

def tail_log(file_path : String, is_error : Bool)
  unless File.exists?(file_path)
    app_log "Warning: Log file #{file_path} not found. Skipping."
    return
  end
  
  app_log "Tailing #{file_path}"
  Process.run("tail", ["-F", file_path]) do |proc|
    io = proc.output
    while line = io.gets
      begin
        data = if is_error
                 {type: "error", message: line}
               else
                 if match = ACCESS_LOG_REGEX.match(line)
                   {
                     type: "access",
                     ip: match[1],
                     path: match[2],
                     status: match[3].to_i,
                     user_agent: match[4]
                   }
                 else
                   {type: "access_raw", message: line}
                 end
               end
               
        json_data = data.to_json
        SOCKETS.each do |socket|
          socket.send(json_data)
        end
      rescue ex
        app_log "Error processing log line: #{ex.message}"
      end
    end
  end
end

spawn tail_log("/var/log/nginx/access.log", false)
spawn tail_log("/var/log/nginx/error.log", true)

def find_free_port(start_port : Int32)
  port = start_port
  while true
    begin
      server = TCPServer.new("127.0.0.1", port)
      server.close
      return port
    rescue Socket::BindError
      port += 1
    end
  end
end

free_port = find_free_port(8070)
app_log "Selected free port: #{free_port}"

Kemal.config.port = free_port
Kemal.run
