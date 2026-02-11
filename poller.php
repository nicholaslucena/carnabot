
<?php
/**
 * CARNABOT POLLER - VERSÃO PHP (HOSTINGER)
 * Este script deve rodar via Cron Job na Hostinger.
 */

// --- CONFIGURAÇÕES ---
// 1. Pegue o "App ID" em Settings -> Keys & IDs
$onesignal_app_id = "SEU_APP_ID_AQUI"; 
// 2. Pegue a "REST API Key" em Settings -> Keys & IDs
$onesignal_rest_key = "SUA_REST_API_KEY_AQUI";

$csv_url = "https://docs.google.com/spreadsheets/d/1Y9NE_QmtnMB612wjFhmjg8v2lAXsZfmlMtZIW_IiTuE/export?format=csv";
$db_file = __DIR__ . '/carnabot_db.json';

header('Content-Type: text/plain');
echo "--- Iniciando checagem --- " . date('Y-m-d H:i:s') . "\n";

// 1. Baixar CSV
$csv_data = file_get_contents($csv_url);
if (!$csv_data) {
    die("Erro: Não foi possível acessar a planilha.\n");
}

$lines = explode("\n", str_replace("\r", "", $csv_data));
$lines = array_filter($lines);
$headers = str_getcsv(strtolower(array_shift($lines)));

$idx_bloco = array_search('bloco', $headers);
$idx_local = array_search('local', $headers);
$idx_hora = array_search('hora', $headers);

if ($idx_bloco === false) die("Erro: Coluna 'bloco' não encontrada.\n");

$current_data = [];
foreach ($lines as $line) {
    $cols = str_getcsv($line);
    $name = trim($cols[$idx_bloco] ?? '');
    if (empty($name)) continue;
    
    $current_data[$name] = [
        'local' => trim($cols[$idx_local] ?? ''),
        'hora'  => trim($cols[$idx_hora] ?? '')
    ];
}

// 2. Comparar com o estado anterior
$old_data = [];
if (file_exists($db_file)) {
    $old_data = json_decode(file_get_contents($db_file), true) ?: [];
}

foreach ($current_data as $name => $info) {
    if (!isset($old_data[$name])) continue; // Ignora blocos novos na primeira vez

    $old_local = $old_data[$name]['local'] ?? '';
    $old_hora  = $old_data[$name]['hora'] ?? '';
    
    $local_changed = ($old_local !== $info['local'] && !empty($info['local']));
    $hora_changed = ($old_hora !== $info['hora'] && !empty($info['hora']));
    
    $msg = "";
    if ($local_changed && $hora_changed) {
        $msg = "🎊 O bloco \"$name\" mudou TUDO! Novo local: {$info['local']} às {$info['hora']}.";
    } elseif ($local_changed) {
        $msg = "📍 Mudança no bloco \"$name\"! O novo local é: {$info['local']}.";
    } elseif ($hora_changed) {
        $msg = "⏰ Horário novo para o bloco \"$name\"! Vai ser às: {$info['hora']}.";
    }

    if (!empty($msg)) {
        echo "Alteração detectada em $name. Enviando...\n";
        sendOneSignalNotification($msg, $onesignal_app_id, $onesignal_rest_key);
    }
}

// 3. Salvar o novo estado
file_put_contents($db_file, json_encode($current_data, JSON_PRETTY_PRINT));
echo "Processo concluído com sucesso.\n";

function sendOneSignalNotification($message, $app_id, $rest_key) {
    $fields = [
        'app_id' => $app_id,
        'included_segments' => ['Total Subscriptions'],
        'contents' => ["pt" => $message],
        'headings' => ["pt" => "Carnabot Avisa! 🥁"]
    ];

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, "https://onesignal.com/api/v1/notifications");
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/json; charset=utf-8',
        'Authorization: Basic ' . $rest_key
    ]);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, TRUE);
    curl_setopt($ch, CURLOPT_POST, TRUE);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($fields));
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, FALSE);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);

    echo "API OneSignal - Status: $http_code | Resposta: $response\n";
}
?>
