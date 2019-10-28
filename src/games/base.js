import Vector from './../common/vector'
import uuid from 'uuid'
import { games, hosted, users } from './../storage'

// LEGACY: Game object for pong
export const Game = (() => {
  class Game {
    constructor(forcedOpponentId) {
      this.id = uuid()
      this.forcedOpponentId = forcedOpponentId
      this.p1 = new Paddle(this.id, 30, h / 2, 10, 100, 'p1')
      this.p2 = new Paddle(this.id, w - 30, h / 2, 10, 100, 'p2')
      this.ball = new Ball(this.id, w / 2, h / 2, 6)
      this.status = 'matchmaking'
      this.hosted = false
      this.secs = 0
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
      if (
        !this.isFull() &&
        ('matchmaking' !== this.status && 'wfo' !== this.status)
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

// kind-of an enum for GameState.
export const GameState = {
  // WAITING_FOR_PLAYERS is used for when the game is open
  // and ready to recieve players. Hosts can configure
  // game options at this time.
  WAITING_FOR_PLAYERS: 0,
  // PREPARATION: there are enough players and players can
  // no longer join. The game host can start the game now.
  PREPARATION: 1,
  // COUNTDOWN: The countdown is currently being shown on
  // the screen. This prevents most actions from happening.
  // Some games may skip this state.
  COUNTDOWN: 2,
  // IN_PROGRESS: This state is used for when the game is
  // in progress. A game may have an internally controlled
  // substate during this time.
  IN_PROGRESS: 3,
  // ENDING: The game is cleaning up and ending. It plans
  // on either deleting itself soon or going to another
  // state soon.
  ENDING: 4
}

// TODO rename to Game
/**
 * The base game class allows ZEIW to create games without adding support
 * for each one by directly interfacing with the websocket. This also allows
 * for matchmaking to occur separately for each game and have common base
 * game features. Blame brxxn if something's wrong here.
 *
 * To use it, create a .js file for your game and then have the class
 * extend BaseGame. You then need to use super to define game data like
 * the name, player count, host, socket, etc.
 *
 * @author brxxn
 */
export class BaseGame {
  /**
   * Construct a game based on the game data object.
   *
   * @param {Object} gameData Object needs to contain a name, socket, maxPlayers, and minPlayers to be valid.
   */
  constructor(gameData) {
    this.socket = gameData.socket
    this.gameId = gameData.gameId
    this.name = gameData.name
    this.state = GameState.WAITING_FOR_PLAYERS
    this.minPlayers = gameData.minPlayers || 2
    this.maxPlayers = gameData.maxPlayers || 3
    this.players = []
    if (gameData.host) {
      this.players.push(gameData.host)
    }
  }

  /**
   * Creates a returnable game object
   */
  getGameData() {
    return {
      gameId: this.gameId,
      name: this.name,
      state: this.state,
      minPlayers: this.minPlayers,
      maxPlayers: this.maxPlayers,
      playerCount: this.players.length
    }
  }

  /**
   * Use this to directly connect to the game's socket.
   */
  getSocket() {
    if (!this.socket) {
      console.warn('no IO server object passed to game.')
    }
    return this.socket.in(this.gameId)
  }

  /**
   * Returns the current game's ID.
   */
  getGameId() {
    return this.gameId
  }

  isFull() {
    return this.players.length >= this.maxPlayers
  }

  addPlayer(player, socket) {
    player.game = this.id
  }

  emit(message) {
    this.socket.in(this.gameId).emit(message)
  }

  /**
   * Updates the clients
   */
  updateClients() {
    this.socket.to(this.gameId).emit('gameUpdate', this.getGameData())
  }
}
