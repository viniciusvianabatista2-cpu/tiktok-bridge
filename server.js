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
  res.send('Servidor Ponte TikTok Ativo!');
});

const activeConnections = new Map();

io.on('connection', (socket) => {
  socket.on('connect_tiktok', ({ uniqueId }) => {
    if (!uniqueId) return;

    if (activeConnections.has(socket.id)) {
      try { activeConnections.get(socket.id).disconnect(); } catch (e) {}
      activeConnections.delete(socket.id);
    }

    const cleanUsername = uniqueId.replace('@', '').trim();

    const tiktok = new WebcastPushConnection(cleanUsername, {
      processInitialData: false,
      enableExtendedGiftInfo: true
    });

    tiktok.connect()
      .then(state => {
        activeConnections.set(socket.id, tiktok);
        socket.emit('tiktok_connected', { username: cleanUsername });
      })
      .catch(err => {
        socket.emit('tiktok_error', { message: 'Não foi possível conectar. Verifique se a live está online.' });
      });

    tiktok.on('chat', data => {
      socket.emit('tiktok_chat', {
        nickname: data.nickname,
        comment: data.comment,
        profilePictureUrl: data.profilePictureUrl
      });
    });

    tiktok.on('gift', data => {
      if (data.giftType === 1 && !data.repeatEnd) return;
      socket.emit('tiktok_gift', {
        nickname: data.nickname,
        giftName: data.giftName,
        repeatCount: data.repeatCount,
        profilePictureUrl: data.profilePictureUrl
      });
    });

    tiktok.on('streamEnd', () => {
      socket.emit('tiktok_error', { message: 'A live foi encerrada.' });
    });
  });

  socket.on('disconnect', () => {
    if (activeConnections.has(socket.id)) {
      try { activeConnections.get(socket.id).disconnect(); } catch (e) {}
      activeConnections.delete(socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Rodando na porta ${PORT}`));
  
