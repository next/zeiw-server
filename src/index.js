import express from 'express'
import { Server } from 'http'
import socketIO from 'socket.io'
import { games, hosted, users } from './common/storage'
import User from './common/user'
import Vector from './common/vector'
import { Game } from './games/base'

const app = express()
const server = new Server(app)
const port = 1337
const io = new socketIO(server)
let w

const h = (w = 550)

io.on('connection', socket => {
  const id = socket.id
  const uonl = Object.keys(users).length
  new User(id)
  socket.emit('load', { h, id, uonl, w })
  socket.on('latency', (startTime, cb) => {
    cb(startTime)
  })
  socket.on('opponent username', msg => {
    socket.broadcast.emit('opponent username', msg)
  })
  socket.on('findGame', (id, opponentId) => {
    if (id in users) {
      findOpenGame(users[id], socket, opponentId)
    } else {
      socket.emit('err', 'User not created on server.')
    }
  })
  socket.on('host', () => {
    let code = Math.random()
      .toString(36)
      .substring(7)
    while (7 !== code.length) {
      code = Math.random()
        .toString(36)
        .substring(7)
    }
    const g = new Game(null)
    g.hosted = true
    g.code = code
    g.addPlayer(users[socket.id], socket)
    hosted[code] = g
    g.status = 'wfo'
  })
  socket.on('join', code => {
    if (hosted[code]) {
      hosted[code].addPlayer(users[socket.id], socket)
      delete hosted[code]
    } else if ('abcd123' === code) {
      socket.emit('failjoin', 'No.')
    } else {
      socket.emit('failjoin', 'No game with that game code exists.')
    }
  })
  socket.on('paddle', ({ player, y, dir, game }) => {
    if (!games[users[socket.id].game]) {
      return
    }
    const paddle = games[users[socket.id].game][player]
    paddle.y = y
    paddle.dir = dir
    socket.broadcast.to(game).emit('paddle', paddle)
  })
  socket.on('readyup', ({ p }) => {
    if (!games[users[socket.id].game]) {
      return
    }
    games[users[socket.id].game].readyUp(p)
  })
  socket.on('ball', () => {
    if (!games[users[socket.id].game]) {
      return
    }
    games[users[socket.id].game].sendBall(socket)
  })
  socket.on('leaveGame', () => {
    if (!games[users[socket.id].game]) {
      return
    }
    games[users[socket.id].game].leaveGame(socket)
  })
  socket.on('disconnect', () => {
    if (games[users[socket.id].game]) {
      games[users[socket.id].game].disconnect(socket)
    }
    delete users[socket.id]
  })
  socket.on('getOnline', () => {
    const uonl = Object.keys(users).length
    socket.emit('uonl', uonl)
  })
})

function findOpenGame(user, socket, opponentId) {
  let g = null
  const gms = Object.keys(games)
  for (const id of gms) {
    if (
      false === games[id].isFull() &&
      'matchmaking' === games[id].status &&
      (null === games[id].forcedOpponentId ||
        games[id].forcedOpponentId === user.id) &&
      (opponentId === undefined || opponentId === games[id].p1.id)
    ) {
      g = games[id]
      break
    }
  }
  if (null === g) {
    if (opponentId === undefined) {
      g = new Game(null)
    } else {
      g = new Game(opponentId)
    }
  }
  g.addPlayer(user, socket)
}

var User = (() => {
  function User(id) {
    this.id = id
    this.game = null
    this.wins = 0
    this.losses = 0
    users[id] = this
  }
  return User
})()
const Ball = (() => {
  class Ball {
    constructor(game, x, y, r) {
      this.x = x
      this.y = y
      this.r = r
      this.spd = 0.3
      this.vel = new Vector()
      this.color = '#ff9900'
      this.game = game
      this.hitsTaken = 0
    }
    update() {
      this.hitsPaddle(games[this.game].p1)
      this.hitsPaddle(games[this.game].p2)
      if (this.y <= this.r || this.y >= h - this.r) {
        this.vel.y *= -1
        io.in(this.game).emit('hit')
      }
      if (this.x < -this.r) {
        games[this.game].end('p2')
        users[games[this.game].p1.id].losses++
        users[games[this.game].p2.id].wins++
      }
      if (this.x > w + this.r) {
        games[this.game].end('p1')
        users[games[this.game].p1.id].wins++
        users[games[this.game].p2.id].losses++
      }
      this.vel.setMag(this.spd)
      this.x += this.vel.x
      this.y += this.vel.y
    }
    hitsPaddle(paddle) {
      const px = paddle.x - paddle.w / 2
      const py = paddle.y - paddle.h / 2
      const dx = this.x - Math.max(px, Math.min(this.x, px + paddle.w))
      const dy = this.y - Math.max(py, Math.min(this.y, py + paddle.h))
      if (dx * dx + dy * dy < this.r * this.r) {
        io.in(this.game).emit('hit')
        if (paddle === games[this.game].p1) {
          io.in(this.game).emit('hit-p1')
        } else if (paddle === games[this.game].p2) {
          io.in(this.game).emit('hit-p2')
        }
        this.vel.x *= -1
        if (0 < paddle.dir) {
          this.vel.y += this.spd / 2
        } else if (0 > paddle.dir) {
          this.vel.y -= this.spd / 2
        }
        this.x =
          'p1' === paddle.player
            ? paddle.x + paddle.w / 2 + this.r
            : px - this.r
        this.hitsTaken++
        if (this.hitsTaken % 5) {
          this.spd *= 1.05
          games[this.game].p1.spd *= 1.05
          games[this.game].p2.spd *= 1.05
        }
      }
    }
  }
  return Ball
})()
server.listen(port, () => {
  console.log(`Server ready @ http://localhost:${port}`)
})
