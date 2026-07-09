<?php
// api/disponibilidad.php
require_once __DIR__ . '/database.php';

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');

$date = $_GET['date'] ?? null;
if (!$date) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing date parameter']);
    exit;
}

try {
    // Retrieve booked times for the specific date
    $stmt = $pdo->prepare("SELECT time FROM citas WHERE date = ?");
    $stmt->execute([$date]);
    $bookedTimes = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    // Define all clinic slots
    $allSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
    
    // Filter out already booked slots
    $availableSlots = array_values(array_diff($allSlots, $bookedTimes));
    
    echo json_encode([
        'success' => true,
        'date' => $date,
        'availableSlots' => $availableSlots
    ]);
} catch (Exception $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => $e->getMessage()]);
}
