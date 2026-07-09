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
        
        const targetPath = "domains/moccasin-giraffe-493510.hostingersite.com/public_html";
        try {
            await client.cd(targetPath);
            console.log(`Navegado exitosamente a: ${targetPath}`);
        } catch (e) {
            console.log(`Error al navegar a la carpeta de destino ${targetPath}:`, e.message);
        }

        console.log("Subiendo archivos raíz...");
        
        const filesToUpload = [
            "index.html",
            "style.css",
            "main.js",
            "logo.png",
            "robots.txt",
            "sitemap.xml",
            "hero_background.webp",
            "instagram_post_3.webp",
            ".htaccess",
            "admin.php"
        ];
        
        for (const file of filesToUpload) {
            const localPath = path.join(__dirname, file);
            if (fs.existsSync(localPath)) {
                console.log(`Subiendo archivo raíz: ${file}`);
                await client.uploadFrom(localPath, file);
            } else {
                console.log(`⚠️ Archivo raíz no encontrado localmente, saltando: ${file}`);
            }
        }

        console.log("Subiendo archivos de la API...");
        // Ensure directory exists on FTP and change to it
        await client.ensureDir("api");
        
        const apiFiles = ["database.php", "disponibilidad.php", "reservas.php", "admin_citas.php"];
        
        for (const file of apiFiles) {
            const localPath = path.join(__dirname, "api", file);
            if (fs.existsSync(localPath)) {
                console.log(`Subiendo API: ${file}`);
                await client.uploadFrom(localPath, file);
            } else {
                console.log(`⚠️ Archivo API no encontrado localmente, saltando: ${file}`);
            }
        }

        // Navigate back to the public root on the FTP server
        await client.cd("/domains/moccasin-giraffe-493510.hostingersite.com/public_html");

        console.log("✅ ¡Despliegue finalizado con éxito! Todos los archivos están en Hostinger.");
    } catch (err) {
        console.error("❌ Error durante el despliegue:", err);
    }
    client.close();
}

deploy();
