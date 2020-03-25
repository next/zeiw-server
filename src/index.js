import { Server } from 'http'
import socketIO from 'socket.io'
import { v4 as uuid } from 'uuid'

const server = new Server()
const io = new socketIO(server)
const port = process.env.PORT || 9000

const h = 550
const w = 550

const games = {}
const users = {}
const hosted = {}

io.set('transports', ['websocket'])

io.on('connection', (socket) => {
  const id = socket.id
  const uonl = Object.keys(users).length

  new User(id)

  socket.emit('load', { h, id, uonl, w })

  socket.on('latency', (startTime, cb) => {
    cb(startTime)
  })

  socket.on('opponent username', (msg) => {
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
    let code = Math.random().toString(36).substring(7)

    while (7 !== code.length) {
      code = Math.random().toString(36).substring(7)
    }

    const g = new Game(null)

    g.hosted = true
    g.code = code

    g.addPlayer(users[socket.id], socket)

    hosted[code] = g

    g.status = 'wfo'
  })

  socket.on('join', (code) => {
    if (hosted[code]) {
      hosted[code].addPlayer(users[socket.id], socket)

      delete hosted[code]
    } else {
      socket.emit('failjoin', 'No game with that game code exists.')
    }
  })

  socket.on('paddle', ({ player, y, dir, game }) => {
    if (!games[users[socket.id].game]) return
    const paddle = games[users[socket.id].game][player]

    paddle.y = y
    paddle.dir = dir

    socket.broadcast.to(game).emit('paddle', paddle)
  })

  socket.on('readyup', ({ p }) => {
    if (!games[users[socket.id].game]) return
    games[users[socket.id].game].readyUp(p)
  })

  socket.on('ball', () => {
    if (!games[users[socket.id].game]) return
    games[users[socket.id].game].sendBall(socket)
  })

  socket.on('leaveGame', () => {
    if (!games[users[socket.id].game]) return
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
      (null === games[id].forcedOpponentId || games[id].forcedOpponentId === user.id) &&
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

var Game = (() => {
  class Game {
    constructor(forcedOpponentId) {
      this.secs = 0
      this.id = uuid()
      this.hosted = false
      this.status = 'matchmaking'
      this.forcedOpponentId = forcedOpponentId
      this.ball = new Ball(this.id, w / 2, h / 2, 6)
      this.p1 = new Paddle(this.id, 30, h / 2, 10, 100, 'p1')
      this.p2 = new Paddle(this.id, w - 30, h / 2, 10, 100, 'p2')

      games[this.id] = this

      const self = this

      this.interval = setInterval(() => {
        if ('playing' === self.status && self.isFull()) {
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
      if (!this.isFull() && 'matchmaking' !== this.status && 'wfo' !== this.status) {
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
        this.updateClients()
        this.status = 'playing'
        this.ball.vel.set(3, 2)
        this.clientTrigger('readyuped')

        const game_1 = this

        this.secint = setInterval(() => {
          game_1.secs++
          game_1.ball.spd = game_1.ball.spd + 0.001
          io.to(game_1.id).emit('gameTimeUpdate', game_1.secs)
        }, 1000)
      }
    }

    sendBall(socket) {
      if ('playing' === this.status || 'readying' === this.status) {
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

  return Game
})()

var User = (() => {
  function User(id) {
    this.id = id
    this.wins = 0
    this.losses = 0
    this.game = null

    users[id] = this
  }

  return User
})()

var Paddle = (() => {
  function Paddle(game, x, y, w, h, player) {
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.dir = 0
    this.spd = 4
    this.game = game
    this.player = player
    this.color = '#ff9900'
  }

  return Paddle
})()

var Ball = (() => {
  class Ball {
    constructor(game, x, y, r) {
      this.x = x
      this.y = y
      this.r = r
      this.spd = 0.3
      this.game = game
      this.hitsTaken = 0
      this.color = '#ff9900'
      this.vel = new Vector()
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

        this.x = 'p1' === paddle.player ? paddle.x + paddle.w / 2 + this.r : px - this.r
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

var Vector = (() => {
  class Vector {
    constructor(x, y) {
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

  return Vector
})()

server.listen(port, () => {
  console.log(`🚀 Server ready at http://localhost:${port}/`)
})
