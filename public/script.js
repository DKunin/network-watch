document.addEventListener('DOMContentLoaded', () => {
    loadDevices();
    setDefaultDate();
    fetchCurrentStatus();

    document.getElementById('check-uptime').addEventListener('click', fetchUptime);
});

async function loadDevices() {
    try {
        const response = await fetch('/devices');
        const devices = await response.json();
        const deviceSelect = document.getElementById('device');

        for (const [ip, name] of Object.entries(devices)) {
            const option = document.createElement('option');
            option.value = ip;
            option.textContent = `${name} (${ip})`;
            deviceSelect.appendChild(option);
        }
    } catch (error) {
        console.error('Error loading devices:', error);
    }
}

function setDefaultDate() {
    const dateInput = document.getElementById('date');
    const today = new Date().toISOString().split('T')[0];
    dateInput.value = today;
}

async function fetchUptime() {
    const device = document.getElementById('device').value;
    const date = document.getElementById('date').value;

    if (!device || !date) {
        document.getElementById('result').textContent = "Please select both a device and a date.";
        return;
    }

    try {
        const response = await fetch(`/uptime/${device}/${date}`);
        const data = await response.json();

        if (data.error) {
            document.getElementById('result').textContent = data.error;
        } else {
            document.getElementById('result').textContent = 
                `Device: ${data.device}\nDate: ${data.date}\nUptime: ${data.uptime_human_readable}`;
        }
    } catch (error) {
        console.error('Error fetching uptime:', error);
        document.getElementById('result').textContent = 'An error occurred while fetching the uptime.';
    }
}

async function fetchCurrentStatus() {
    try {
        const response = await fetch('/status');
        const statuses = await response.json();
        const statusList = document.getElementById('device-status');
        statusList.innerHTML = '';

        for (const [ip, status] of Object.entries(statuses)) {
            const listItem = document.createElement('li');
            listItem.textContent = `${status.name} (${ip}): ${status.isOnline ? 'ONLINE' : 'OFFLINE'}`;
            statusList.appendChild(listItem);
        }
    } catch (error) {
        console.error('Error fetching current status:', error);
    }
}
