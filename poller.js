
const axios = require('axios');
const fs = require('fs');

const CSV_URL = "https://docs.google.com/spreadsheets/d/1Y9NE_QmtnMB612wjFhmjg8v2lAXsZfmlMtZIW_IiTuE/export?format=csv";
const DB_FILE = './carnabot_db.json';
const ONESIGNAL_APP_ID = "SEU_ONESIGNAL_APP_ID";
const ONESIGNAL_REST_KEY = "SUA_API_KEY_DO_ONESIGNAL";

async function poll() {
  try {
    console.log("Checando planilha...");
    const response = await axios.get(CSV_URL);
    const csvData = response.data;
    
    const lines = csvData.split('\n').filter(l => l.trim() !== '');
    const headers = lines[0].toLowerCase().split(',').map(h => h.trim());
    
    const idx = {
      bloco: headers.indexOf('bloco'),
      local: headers.indexOf('local'),
      hora: headers.indexOf('hora')
    };

    const currentData = {};
    lines.slice(1).forEach(line => {
      const cols = line.split(',').map(c => c.trim());
      const name = cols[idx.bloco];
      if (name) {
        currentData[name] = {
          local: cols[idx.local] || '',
          hora: cols[idx.hora] || ''
        };
      }
    });

    let oldData = {};
    if (fs.existsSync(DB_FILE)) {
      oldData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }

    for (const [name, info] of Object.entries(currentData)) {
      if (!oldData[name]) continue;

      const localChanged = oldData[name].local !== info.local && info.local !== '';
      const horaChanged = oldData[name].hora !== info.hora && info.hora !== '';
      
      let msg = "";
      if (localChanged && horaChanged) {
        msg = `🎊 O bloco "${name}" mudou tudo! Novo local: ${info.local} às ${info.hora}.`;
      } else if (localChanged) {
        msg = `📍 O bloco "${name}" mudou de lugar! Novo local: ${info.local}.`;
      } else if (horaChanged) {
        msg = `⏰ O bloco "${name}" mudou de horário! Agora é às: ${info.hora}.`;
      }

      if (msg) {
        console.log(`Enviando: ${msg}`);
        await sendNotification(msg);
      }
    }

    fs.writeFileSync(DB_FILE, JSON.stringify(currentData, null, 2));
    console.log("Processo concluído.");

  } catch (error) {
    console.error("Erro no polling:", error.message);
  }
}

async function sendNotification(message) {
  try {
    await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: ONESIGNAL_APP_ID,
      included_segments: ["Total Subscriptions"],
      contents: { "en": message, "pt": message },
      headings: { "en": "Carnabot Avisa! 🥁", "pt": "Carnabot Avisa! 🥁" }
    }, {
      headers: { 'Authorization': `Basic ${ONESIGNAL_REST_KEY}` }
    });
  } catch (err) {
    console.error("Erro OneSignal:", err.response?.data || err.message);
  }
}

poll();
