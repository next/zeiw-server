export default function Paddle(game, x, y, w, h, player) {
    this.x = x
    this.y = y
    this.w = w
    this.h = h
    this.dir = 0
    this.spd = 4
    this.color = '#ff9900'
    this.game = game
    this.player = player
};