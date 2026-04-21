const http = require('http');
const fs = require('fs');

const PORT = 4000;

http.createServer((req, res) => {
    console.log(`Request received: ${req.url}`);
    let file = req.url === '/' ? 'index.html' : req.url.slice(1).split('?')[0];
    
    fs.readFile(file, (err, data) => {
        if (err) {
            console.log(`Error reading file ${file}: ${err.message}`);
            res.writeHead(404);
            res.end("Not Found");
        } else {
            res.writeHead(200);
            res.end(data);
        }
    });
}).listen(PORT, '0.0.0.0', () => {
    console.log(`\n************************************`);
    console.log(`SERVER STARTED ON PORT: ${PORT}`);
    console.log(`TRY OPENING: http://127.0.0.1:${PORT}`);
    console.log(`************************************\n`);
});
