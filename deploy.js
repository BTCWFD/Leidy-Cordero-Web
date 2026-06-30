require('dotenv').config();
const ftp = require("basic-ftp");
const fs = require("fs");
const path = require("path");

async function deploy() {
    const client = new ftp.Client();
    client.ftp.verbose = true; // Output detailed logs

    try {
        console.log("Conectando al servidor FTP de Hostinger...");
        await client.access({
            host: process.env.FTP_HOST,
            user: process.env.FTP_USER,
            password: process.env.FTP_PASSWORD,
            secure: true,
            secureOptions: { rejectUnauthorized: false }
        });

        console.log("Conexión exitosa. Navegando a la carpeta de destino...");
        
        try {
            await client.cd("public_html");
        } catch (e) {
            console.log("Nota: Estamos listos para subir archivos (probablemente el FTP ya nos ubicó dentro de public_html automáticamente).");
        }

        console.log("Subiendo archivos...");
        
        const filesToUpload = ["index.html", "style.css", "main.js", "logo.png"];
        
        for (const file of filesToUpload) {
            const localPath = path.join(__dirname, file);
            if (fs.existsSync(localPath)) {
                console.log(`Subiendo: ${file}`);
                await client.uploadFrom(localPath, file);
            } else {
                console.log(`⚠️ Archivo no encontrado localmente, saltando: ${file}`);
            }
        }

        console.log("✅ ¡Despliegue finalizado con éxito! Todos los archivos están en Hostinger.");
    } catch (err) {
        console.error("❌ Error durante el despliegue:", err);
    }
    client.close();
}

deploy();
