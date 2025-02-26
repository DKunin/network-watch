async function loadDevices() {
    const response = await fetch('/devices');
    const devices = await response.json();
    const deviceSelect = document.getElementById('device');

    for (const [ip, name] of Object.entries(devices)) {
        const option = document.createElement('option');
        option.value = ip;
        option.textContent = `${name} (${ip})`;
        deviceSelect.appendChild(option);
    }
}

async function fetchUptime() {
    const device = document.getElementById('device').value;
    const date = document.getElementById('date').value;

    if (!device || !date) {
        document.getElementById('result').textContent = "Please select both a device and a date.";
        return;
    }

    const response = await fetch(`/uptime/${device}/${date}`);
    const data = await response.json();

    if (data.error) {
        document.getElementById('result').textContent = data.error;
    } else {
        document.getElementById('result').textContent = 
            `Device: ${data.device}\nDate: ${data.date}\nUptime: ${data.uptime_human_readable}`;
    }
}

// Load devices on page load
window.onload = loadDevices;
