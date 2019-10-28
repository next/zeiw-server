export default class Vector {
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