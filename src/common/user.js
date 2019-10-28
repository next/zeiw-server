import { users } from './../storage'

export default class User {
  constructor(id) {
    this.id = id
    this.game = null
    this.wins = 0
    this.losses = 0
    users[id] = this
  }

  updateToStorage() {
    users[id] = this
  }
}
