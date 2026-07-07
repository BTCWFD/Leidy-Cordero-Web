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
            secureOptions: { 
                rejectUnauthorized: true,
                checkServerIdentity: () => undefined
            }
        });

        console.log("Conexión exitosa. Navegando a la carpeta de destino...");
        
        try {
            await client.cd("/");
        } catch (e) {
            console.log("Error al navegar a la raíz del FTP.");
        }

        console.log("Subiendo archivos...");
        
        const filesToUpload = ["index.html", "style.css", "main.js", "logo.png", "robots.txt", "sitemap.xml", "hero_background.webp", "instagram_post_3.webp"];
        
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
