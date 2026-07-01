const sharp = require('sharp');
const fs = require('fs');

async function compressImage() {
    console.log("Comprimiendo logo.png...");
    await sharp('logo.png')
        .resize({ width: 400 }) // Reducir a un tamaño razonable para logo
        .png({ quality: 80 }) // Mantener como PNG por la transparencia
        .toFile('logo-opt.png');
    console.log("¡Compresión finalizada! Imagen guardada como logo-opt.png");
}

compressImage().catch(console.error);
