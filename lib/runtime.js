/* dendry
 * http://github.com/idmillington/dendry
 *
 * MIT License
 */
/*jshint indent:2 */
(function() {
  "use strict";

  // To avoid the need to include any utility libraries when this is
  // used in a browser, define some helper functions we'd normally
  // rely on libraries for.

  var assert = function(mustBeTrue) {
    /* istanbul ignore if */
    if (!mustBeTrue) throw new Error("Assertion failed.");
  };

  var each = function(array, fn) {
    for (var i = 0; i < array.length; ++i) {
      fn(array[i]);
    }
  };

  var objEach = function(obj, fn) {
    for (var key in obj) {
      fn(key);
    }
  };


  // ------------------------------------------------------------------------

  // Objects with this interface are passed to a game state to have it
  // display content.
  var RuntimeInterface = function() {};
  RuntimeInterface.prototype.displayContent = function(content) {};
  RuntimeInterface.prototype.displayChoices = function(choices) {};
  RuntimeInterface.prototype.removeChoices = function() {};
  RuntimeInterface.prototype.newPage = function() {};

  // A game state is given a runtime interface, the game and the
  // current game state (can be omitted). GameState from the user
  // is given to the object to move the story on.
  var GameState = function(runtime, game, state) {
    this.runtime = runtime;
    this.game = game;
    this.state = state;
  };

  GameState.prototype.displayGameOver = function() {
    this.runtime.displayContent("Game Over");

    return this;
  };

  GameState.prototype.displayChoices = function() {
    var choices = this.getCurrentChoices();
    assert(choices);
    this.runtime.displayChoices(choices);

    return this;
  };

  GameState.prototype.displaySceneContent = function() {
    var scene = this.getCurrentScene();
    assert(scene);

    if (scene.newPage) {
      this.runtime.newPage();
    }
    this.runtime.removeChoices();

    if (scene.content) {
      this.runtime.displayContent(scene.content);
    }

    return this;
  };

  GameState.prototype.choose = function(choiceIndex) {
    var choices = this.state.choices;

    // Check for valid choice.
    assert(choices);
    if (choices.length <= choiceIndex) {
      throw new Error("No choice at index "+choiceIndex+", only "+
                      choices.length+" choices are available.");
    }

    // Commit the choice.
    var choice = choices[choiceIndex];
    var id = choice.id;

    delete this.state.choices;
    this.state.turn++;
    this.goToScene(id);

    return this;
  };

  GameState.prototype.goToScene = function(id) {
    var scene = this.game.scenes[id];
    assert(scene);

    if (this.state.visits[id] === undefined) this.state.visits[id] = 1;
    else this.state.visits[id]++;

    this.state.sceneId = id;
    this.displaySceneContent();

    // Check if we're done.
    if (scene.gameOver) {
      this.gameOver();
    } else if (scene.goTo) {
      this.goToScene(scene.goTo);
    } else {
      // Check game over based on exhaustion (follows goto check)
      this.state.choices = this._compileChoices(scene);
      if (this.state.choices === null) {
        this.gameOver();
      } else {
        this.displayChoices();
      }
    }
  };

  GameState.prototype.getRootSceneId = function() {
    return this.game.firstScene || 'root';
  };

  GameState.prototype.beginGame = function() {
    this.state = {
      sceneId: null,
      gameOver: false,
      turn: 0,
      visits: {}
    };

    var id = this.getRootSceneId();
    this.goToScene(id);

    return this;
  };

  GameState.prototype.gameOver = function() {
    this.state.gameOver = true;
    this.displayGameOver();
    return this;
  };

  GameState.prototype.isGameOver = function() {
    return this.state.gameOver;
  };

  GameState.prototype.getCurrentScene = function() {
    var scene = this.game.scenes[this.state.sceneId];
    assert(scene !== undefined);
    return scene;
  };

  // Returns the choices for the current scene. Choices are objects
  // with an id and a title property, not to be confused with the
  // option objects in a scene (though options are used to generate
  // choices). Choices are compiled from the options belonging to the
  // current scene.
  GameState.prototype.getCurrentChoices = function() {
    return this.state.choices;
  };

  // ------------------------------------------------------------------------

  GameState.prototype._compileChoices = function(scene) {
    var that = this;
    var id;

    assert(scene);

    var options = scene.options;
    if (options !== undefined && options.options !== undefined) {
      // We have options, turn them into choices.
      options = options.options;

      // First build a mapping form id to title.
      var choices = {};
      each(options, function(option) {
        if (option.id.substr(0, 1) === '@') {
          // This is an id, use it.
          choices[option.id.substring(1)] = option.title || null;
        } else {
          assert(option.id.substr(0, 1) === '#');
          // This is a tag, add all matching ids.
          var ids = that.game.tagLookup[option.id.substring(1)];
          objEach(ids, function(id) {
            if (choices[id] === undefined) choices[id] = null;
          });
        }
      });

      // Remove ids that have had their maximum number of visits.
      var validChoices = {};
      for (id in choices) {
        var maxVisits = this.game.scenes[id].maxVisits;
        var visits = this.state.visits[id] || 0;
        if (maxVisits !== undefined && visits >= maxVisits) continue;

        validChoices[id] = choices[id];
      }

      // Then make sure we have titles for all the ids we do have.
      var result = [];
      for (id in validChoices) {
        var title = validChoices[id];
        if (title === null) {
          title = this.game.scenes[id].title;
        }
        assert(title);
        result.push({id:id, title:title});
      }

      if (result.length > 0) {
        return result;
      }
    }

    // We have no options, see if we need to use the default option.
    var root = this.getRootSceneId();
    if (root !== this.state.sceneId) {
      return [{id:root, title:'Scene Complete'}];
    } else {
      // There are no possible options.
      return null;
    }
  };

  // ------------------------------------------------------------------------

  module.exports = {
    GameState: GameState,
    NullRuntimeInterface: RuntimeInterface
  };
}());