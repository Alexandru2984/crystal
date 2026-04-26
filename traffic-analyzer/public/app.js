const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
const wsUrl = `${wsProtocol}//${window.location.host}/live`;
let ws;

// State
let totalRequests = 0;
let totalErrors = 0;
let currentRpsCount = 0;
let rps = 0;
const statusCounts = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
const ipCounts = {};
const endpointCounts = {};
const trafficHistory = Array(60).fill(0); // 60 seconds

// DOM Elements
const connIndicator = document.getElementById('connection-status');
const connText = document.getElementById('connection-text');
const rpsEl = document.getElementById('rps-counter');
const totalReqEl = document.getElementById('total-requests');
const totalErrEl = document.getElementById('total-errors');
const topIpsEl = document.getElementById('top-ips');
const topEndpointsEl = document.getElementById('top-endpoints');
const errorLogsEl = document.getElementById('error-logs');

// Charts Setup
Chart.defaults.color = '#aaaaaa';
Chart.defaults.borderColor = '#333333';

const statusCtx = document.getElementById('statusChart').getContext('2d');
const statusChart = new Chart(statusCtx, {
  type: 'doughnut',
  data: {
    labels: ['2xx', '3xx', '4xx', '5xx'],
    datasets: [{
      data: [0, 0, 0, 0],
      backgroundColor: ['#03dac6', '#bb86fc', '#ffb74d', '#cf6679'],
      borderWidth: 0
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'right' }
    }
  }
});

const trafficCtx = document.getElementById('trafficChart').getContext('2d');
const trafficChart = new Chart(trafficCtx, {
  type: 'line',
  data: {
    labels: Array(60).fill(''),
    datasets: [{
      label: 'Requests/sec',
      data: trafficHistory,
      borderColor: '#bb86fc',
      backgroundColor: 'rgba(187, 134, 252, 0.2)',
      borderWidth: 2,
      fill: true,
      tension: 0.4,
      pointRadius: 0
    }]
  },
  options: {
    responsive: true,
    maintainAspectRatio: false,
    scales: {
      y: { beginAtZero: true, suggestedMax: 10 },
      x: { grid: { display: false } }
    },
    animation: { duration: 0 }
  }
});

function connectWebSocket() {
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    connIndicator.className = 'indicator connected';
    connText.textContent = 'Connected';
  };

  ws.onclose = () => {
    connIndicator.className = 'indicator disconnected';
    connText.textContent = 'Disconnected - Reconnecting...';
    setTimeout(connectWebSocket, 3000);
  };

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      handleMessage(data);
    } catch (e) {
      console.error('Failed to parse message', e);
    }
  };
}

function handleMessage(data) {
  if (data.type === 'access') {
    totalRequests++;
    currentRpsCount++;
    totalReqEl.textContent = totalRequests;

    // Status codes
    const status = data.status;
    if (status >= 200 && status < 300) statusCounts['2xx']++;
    else if (status >= 300 && status < 400) statusCounts['3xx']++;
    else if (status >= 400 && status < 500) {
      statusCounts['4xx']++;
      totalErrors++;
      const errCard = document.querySelector('.error-card');
      if (errCard) {
        errCard.classList.add('flash-error');
        setTimeout(() => errCard.classList.remove('flash-error'), 1000);
      }
      addErrorLog(`[${status}] ${data.path}`);
    }
    else if (status >= 500) {
      statusCounts['5xx']++;
      totalErrors++;
      const errCard = document.querySelector('.error-card');
      if (errCard) {
        errCard.classList.add('flash-error');
        setTimeout(() => errCard.classList.remove('flash-error'), 1000);
      }
      addErrorLog(`[${status}] ${data.path}`);
    }
    totalErrEl.textContent = totalErrors;

    // IPs
    ipCounts[data.ip] = (ipCounts[data.ip] || 0) + 1;
    
    // Endpoints
    endpointCounts[data.path] = (endpointCounts[data.path] || 0) + 1;
    
  } else if (data.type === 'error') {
    totalErrors++;
    totalErrEl.textContent = totalErrors;
    addErrorLog(data.message.substring(0, 80) + '...');
  }
}

function addErrorLog(msg) {
  const li = document.createElement('li');
  li.textContent = msg;
  errorLogsEl.prepend(li);
  if (errorLogsEl.children.length > 10) {
    errorLogsEl.removeChild(errorLogsEl.lastChild);
  }
}

function updateTopList(counts, element, limit = 5) {
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, limit);
  element.innerHTML = '';
  sorted.forEach(([key, val]) => {
    const li = document.createElement('li');
    
    const keySpan = document.createElement('span');
    keySpan.textContent = key.length > 30 ? key.substring(0, 27) + '...' : key;
    keySpan.title = key;
    
    const valSpan = document.createElement('span');
    valSpan.textContent = val;
    valSpan.style.fontWeight = 'bold';
    valSpan.style.color = 'var(--accent-color)';
    
    li.appendChild(keySpan);
    li.appendChild(valSpan);
    element.appendChild(li);
  });
}

// 1-second interval loop
setInterval(() => {
  rps = currentRpsCount;
  currentRpsCount = 0;
  rpsEl.textContent = rps;

  // Update Traffic Chart
  trafficHistory.shift();
  trafficHistory.push(rps);
  trafficChart.update();

  // Update Status Chart
  statusChart.data.datasets[0].data = [
    statusCounts['2xx'],
    statusCounts['3xx'],
    statusCounts['4xx'],
    statusCounts['5xx']
  ];
  statusChart.update();

  // Update Lists
  updateTopList(ipCounts, topIpsEl);
  updateTopList(endpointCounts, topEndpointsEl);
}, 1000);

connectWebSocket();
