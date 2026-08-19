const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { WebcastPushConnection } = require('tiktok-live-connector');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.get('/', (req, res) => {
  res.status(200).send('Servidor Ponte TikTok Operacional');
});

const activeConnections = new Map();

io.on('connection', (socket) => {
  console.log(`[Socket] Cliente conectado: ${socket.id}`);

  socket.on('connect_tiktok', ({ uniqueId }) => {
    if (!uniqueId) {
      return socket.emit('tiktok_error', { message: 'Usuário do TikTok não fornecido.' });
    }

    if (activeConnections.has(socket.id)) {
      try { 
        activeConnections.get(socket.id).disconnect(); 
      } catch (e) {}
      activeConnections.delete(socket.id);
    }

    const cleanUsername = uniqueId.replace('@', '').trim();
    console.log(`[TikTok] Tentando conectar à live: @${cleanUsername}`);

    const tiktok = new WebcastPushConnection(cleanUsername, {
      processInitialData: true,
      enableExtendedGiftInfo: true,
      requestOptions: {
        timeout: 10000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        }
      },
      websocketOptions: {
        timeout: 10000
      }
    });

    tiktok.connect()
      .then(state => {
        console.log(`[TikTok] Conectado à live: @${cleanUsername}`);
        activeConnections.set(socket.id, tiktok);
        socket.emit('tiktok_connected', { username: cleanUsername, roomId: state.roomId });
      })
      .catch(err => {
        console.error(`[TikTok Error] Falha ao conectar:`, err.toString());
        socket.emit('tiktok_error', { 
          message: 'Não foi possível encontrar a live. Verifique se o nome está correto e se você está ao vivo.' 
        });
      });

    tiktok.on('chat', data => {
      socket.emit('tiktok_chat', {
        nickname: data.nickname || data.uniqueId,
        comment: data.comment,
        profilePictureUrl: data.profilePictureUrl
      });
    });

    tiktok.on('gift', data => {
      if (data.giftType === 1 && data.repeatEnd === false) return;

      socket.emit('tiktok_gift', {
        nickname: data.nickname || data.uniqueId,
        giftName: data.giftName,
        repeatCount: data.repeatCount || 1,
        profilePictureUrl: data.profilePictureUrl
      });
    });

    tiktok.on('streamEnd', () => {
      socket.emit('tiktok_error', { message: 'A live foi encerrada.' });
    });
  });

  socket.on('disconnect', () => {
    if (activeConnections.has(socket.id)) {
      try { 
        activeConnections.get(socket.id).disconnect(); 
      } catch (e) {}
      activeConnections.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`[Server] Rodando na porta ${PORT}`));
        
