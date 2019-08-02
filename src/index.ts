export {}

const uuid = require('uuid')
const express = require('express')
const app = require('express')()
const http = require('http').createServer(app)
const io = require('socket.io')(http)
const port = process.env.PORT || 80

let w
let games = {}
let hosted = {}
let users = {}

const h = (w = 550)

io.on('connection', function(socket) {
  let id = socket.id
  const uonl = Object.keys(users).length
  new User(id)
  socket.emit('load', {
    id,
    h,
    w,
    uonl
  })
  socket.on('findGame', function(id) {
    if (id in users) {
      findOpenGame(users[id], socket)
    } else {
      socket.emit('err', 'User not created on server.')
    }
  })
  socket.on('host', function() {
    let code = Math.random()
      .toString(36)
      .substring(7)
    while (code.length !== 7) {
      code = Math.random()
        .toString(36)
        .substring(7)
    }
    const g = new Game()
    g.hosted = true
    g.code = code
    g.addPlayer(users[socket.id], socket)
    hosted[code] = g
    g.status = 'wfo'
  })
  socket.on('join', function(code) {
    if (hosted[code]) {
      hosted[code].addPlayer(users[socket.id], socket)
      delete hosted[code]
    } else if (code === 'abcd123') {
      socket.emit('failjoin', 'No.')
    } else {
      socket.emit('failjoin', 'No game with that game code exists.')
    }
  })
  socket.on('paddle', function(p) {
    if (!games[users[socket.id].game]) {
      return
    }
    const paddle = games[users[socket.id].game][p.player]
    paddle.y = p.y
    paddle.dir = p.dir
    socket.broadcast.to(p.game).emit('paddle', paddle)
  })
  socket.on('readyup', function(data) {
    if (!games[users[socket.id].game]) {
      return
    }
    games[users[socket.id].game].readyUp(data.p)
  })
  socket.on('ball', function() {
    if (!games[users[socket.id].game]) {
      return
    }
    games[users[socket.id].game].sendBall(socket)
  })
  socket.on('leaveGame', function() {
    if (!games[users[socket.id].game]) {
      return
    }
    games[users[socket.id].game].leaveGame(socket)
  })
  socket.on('disconnect', function() {
    if (games[users[socket.id].game]) {
      games[users[socket.id].game].disconnect(socket)
    }
    delete users[socket.id]
  })
  socket.on('getOnline', function() {
    const uonl = Object.keys(users).length
    socket.emit('uonl', uonl)
  })
})

function findOpenGame(user, socket) {
  let g: Game | null = null
  const gms = Object.keys(games)
  for (let i = 0; i < gms.length; i++) {
    const id = gms[i]
    if (games[id].isFull() === false && games[id].status === 'matchmaking') {
      g = games[id]
      break
    }
  }
  if (g === null) {
    g = new Game()
  }
  g.addPlayer(user, socket)
}
class Game {
  public id: any
  public p1: any
  public p2: any
  public ball: any
  public status: any
  public hosted: any
  public secs: any
  public interval: any
  public secint: any
  public code: any

  constructor() {
    this.id = uuid()
    this.p1 = new Paddle(this.id, 30, h / 2, 10, 100, 'p1')
    this.p2 = new Paddle(this.id, w - 30, h / 2, 10, 100, 'p2')
    this.ball = new Ball(this.id, w / 2, h / 2, 6)
    this.status = 'matchmaking'
    this.hosted = false
    this.secs = 0
    games[this.id] = this
    const self = this
    this.interval = setInterval(function() {
      if (self.status === 'playing' && self.isFull()) {
        self.ball.update()
      }
    })
  }
  isFull() {
    return !!(this.p1.id && this.p2.id)
  }
  addPlayer(player, socket) {
    if (!this.p1.id) {
      this.p1.id = player.id
    } else if (!this.p2.id) {
      this.p2.id = player.id
    } else {
      socket.emit('err', 'Failed to join game. Try again?')
      return
    }
    socket.join(this.id)
    player.game = this.id
    this.updateClients()
    if (this.isFull()) {
      this.status = 'readying'
      this.clientTrigger('gameready')
      this.updateClients()
    }
  }
  updateClients() {
    if (
      !this.isFull() &&
      (this.status !== 'matchmaking' && this.status !== 'wfo')
    ) {
      this.status = 'disconnected'
    }
    const game = Object.assign({}, this)
    game.interval = ''
    io.to(this.id).emit('gameUpdate', game)
  }
  clientTrigger(t) {
    io.in(this.id).emit('clientTrigger', t)
  }
  readyUp(player) {
    this[player].ready = true
    if (this.p1.ready && this.p2.ready) {
      this.status = 'playing'
      this.ball.vel.set(3, 2)
      this.updateClients()
      this.clientTrigger('readyuped')
      const game = this
      this.secint = setInterval(function() {
        game.secs++
        game.ball.spd = game.ball.spd + 0.001
        io.to(game.id).emit('gameTimeUpdate', game.secs)
      }, 1000)
    }
  }
  sendBall(socket) {
    if (this.status === 'playing' || this.status === 'readying') {
      socket.emit('ball', this.ball)
    }
  }
  disconnect(socket) {
    this.leaveGame(socket)
    io.in(this.id).emit('disconnection')
  }
  end(winner) {
    clearInterval(this.secint)
    io.in(this.id).emit('end', this[winner].id)
  }
  leaveGame(socket) {
    clearInterval(this.secint)
    socket.leave(this.id)
    if (this.p1.id === socket.id) {
      this.p1.id = false
    } else if (this.p2.id === socket.id) {
      this.p2.id = false
    }
    this.updateClients()
    if (!this.p1.id && !this.p2.id) {
      delete games[this.id]
      if (this.code && this.code in hosted) {
        delete hosted[this.code]
      }
    }
  }
}
class User {
  public id: any
  public game: any
  public wins: any
  public losses: any

  constructor(id) {
    this.id = id
    this.game = null
    this.wins = 0
    this.losses = 0
    users[id] = this
  }
}
class Paddle {
  public x: any
  public y: any
  public w: any
  public h: any
  public dir: any
  public spd: any
  public color: any
  public game: any
  public player: any

  constructor(game, x, y, w, h, player) {
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.dir = 0
    this.spd = 4
    this.color = '#ff9900'
    this.game = game
    this.player = player
  }
}
class Ball {
  public x: any
  public y: any
  public r: any
  public spd: any
  public vel: any
  public color: any
  public game: any
  public hitsTaken: any

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
      if (paddle.dir > 0) {
        this.vel.y += this.spd / 2
      } else if (paddle.dir < 0) {
        this.vel.y -= this.spd / 2
      }
      this.x =
        paddle.player === 'p1' ? paddle.x + paddle.w / 2 + this.r : px - this.r
      this.hitsTaken++
      if (this.hitsTaken % 5) {
        this.spd *= 1.05
        games[this.game].p1.spd *= 1.05
        games[this.game].p2.spd *= 1.05
      }
    }
  }
}
class Vector {
  public x: any
  public y: any

  constructor(x?, y?) {
    this.x = x || 0
    this.y = y || 0
  }
  set(x, y) {
    this.x = x
    this.y = y
    return this
  }
  mult(f) {
    ;(this.x *= f), (this.y *= f)
    return this
  }
  div(f) {
    ;(this.x /= f), (this.y /= f)
    return this
  }
  mag() {
    return Math.sqrt(this.x * this.x + this.y * this.y)
  }
  setMag(m) {
    this.div(this.mag())
    this.mult(m)
    return this
  }
}

http.listen(port, function() {
  console.log(`> Listening on *:${port}`)
})
