<?php
// api/reservas.php
require_once __DIR__ . '/database.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Read and decode JSON input payload
$rawInput = file_get_contents('php://input');
$input = json_decode($rawInput, true);

if ($input === null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON input']);
    exit;
}

$name = $input['name'] ?? null;
$date = $input['date'] ?? null;
$time = $input['time'] ?? null;
$phone = $input['phone'] ?? null;

// Validate existence and types
if ($name === null || $date === null || $time === null || $phone === null) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields: name, date, time, phone']);
    exit;
}

if (!is_string($name) || !is_string($date) || !is_string($time) || !is_string($phone)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid fields format']);
    exit;
}

$name = trim($name);
$date = trim($date);
$time = trim($time);
$phone = trim($phone);

if ($name === '' || $date === '' || $time === '' || $phone === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid fields format']);
    exit;
}

// Date Format validation: YYYY-MM-DD
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $date)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Date must be in YYYY-MM-DD format']);
    exit;
}

$dateParts = explode('-', $date);
$year = (int)$dateParts[0];
$month = (int)$dateParts[1];
$day = (int)$dateParts[2];

if ($month < 1 || $month > 12) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid date values']);
    exit;
}

// Valid calendar date check
if (!checkdate($month, $day, $year)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid calendar date']);
    exit;
}

// Past Date check (Colombia Timezone)
date_default_timezone_set('America/Bogota');
$todayStr = date('Y-m-d');
$compareDate = $date;
if ($year < 100) {
    $compareDate = sprintf('%04d-%02d-%02d', 2000 + $year, $month, $day);
}

if ($compareDate < $todayStr) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Booking date cannot be in the past']);
    exit;
}

// Phone format validation function matching Node.js regex & logic
function validatePhone($phone) {
    if (!is_string($phone)) return false;
    if (strpos($phone, "\n") !== false || strpos($phone, "\r") !== false) return false;
    if (strlen($phone) < 3 || strlen($phone) > 50) return false;
    
    // Pattern: /^\+?[0-9\s\-()]+(?:\s*(?:ext|x|ext\.)\s*[0-9]+)?$/i
    if (!preg_match('/^\+?[0-9\s\-()]+(?:\s*(?:ext|x|ext\.)\s*[0-9]+)?$/i', $phone)) return false;
    
    // Split by ext to isolate base phone number digits
    $parts = preg_split('/(?:ext|x|ext\.)/i', $phone);
    $basePart = $parts[0];
    
    // Check base digits
    $digits = preg_replace('/\D/', '', $basePart);
    if (strlen($digits) < 3 || strlen($digits) > 15) return false;
    
    // Total digits check
    $totalDigits = preg_replace('/\D/', '', $phone);
    if (strlen($totalDigits) < 3) return false;
    
    return true;
}

if (!validatePhone($phone)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid phone number format']);
    exit;
}

// Validate slot time
$allowedSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'];
if (!in_array($time, $allowedSlots)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid slot time selected. Must be one of the allowed operating slots.']);
    exit;
}

try {
    // Insert into the database
    $stmt = $pdo->prepare("INSERT INTO citas (name, date, time, phone) VALUES (?, ?, ?, ?)");
    $stmt->execute([$name, $date, $time, $phone]);
    $bookingId = $pdo->lastInsertId();
    
    echo json_encode([
        'success' => true,
        'bookingId' => (string)$bookingId
    ]);
} catch (PDOException $e) {
    if (strpos($e->getMessage(), 'UNIQUE constraint failed') !== false) {
        http_response_code(400);
        echo json_encode(['success' => false, 'error' => 'Double booking detected: this slot is already reserved.']);
    } else {
        http_response_code(500);
        echo json_encode(['success' => false, 'error' => $e->getMessage()]);
    }
}
