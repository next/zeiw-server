import Vector from '../../common/vector'
import { games } from '../../storage'

export default class Ball {
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
        'p1' === paddle.player ? paddle.x + paddle.w / 2 + this.r : px - this.r
      this.hitsTaken++
      if (this.hitsTaken % 5) {
        this.spd *= 1.05
        games[this.game].p1.spd *= 1.05
        games[this.game].p2.spd *= 1.05
      }
    }
  }
}
