var _ = require("lodash");
var crypto = require("crypto");

var Meteor = {
  isClient: false,
  isServer: true,
  startup: function(fn) {
    return fn();
  },
  userId: function() {
    return null;
  },
  Collection: {
    ObjectID: function(hexString) {
      if (hexString) {
        hexString = hexString.toLowerCase();
        this._str = hexString;
      } else {
        var bytes = crypto.randomBytes(24);
        this._str = bytes.toString("hex");
      }
    }
  },

  // from https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/meteor/helpers.js#L123-L146
  // Sets child's prototype to a new object whose prototype is parent's
  // prototype. Used as:
  //   Meteor._inherits(ClassB, ClassA).
  //   _.extend(ClassB.prototype, { ... })
  // Inspired by CoffeeScript's `extend` and Google Closure's `goog.inherits`.
  _inherits: function (Child, Parent) {
    // copy Parent static properties
    for (var key in Parent) {
      // make sure we only copy hasOwnProperty properties vs. prototype
      // properties
      if (_.has(Parent, key))
        Child[key] = Parent[key];
    }

    // a middle member of prototype chain: takes the prototype from the Parent
    var Middle = function () {
      this.constructor = Child;
    };
    Middle.prototype = Parent.prototype;
    Child.prototype = new Middle();
    Child.__super__ = Parent.prototype;
    return Child;
  }
};

// From https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/meteor/errors.js

// Makes an error subclass which properly contains a stack trace in most
// environments. constructor can set fields on `this` (and should probably set
// `message`, which is what gets displayed at the top of a stack trace).
//
Meteor.makeErrorType = function (name, constructor) {
  var errorClass = function (/*arguments*/) {
    var self = this;

    // Ensure we get a proper stack trace in most Javascript environments
    if (Error.captureStackTrace) {
      // V8 environments (Chrome and Node.js)
      Error.captureStackTrace(self, errorClass);
    } else {
      // Firefox
      var e = new Error;
      e.__proto__ = errorClass.prototype;
      if (e instanceof errorClass)
        self = e;
    }
    // Safari magically works.

    constructor.apply(self, arguments);

    self.errorType = name;

    return self;
  };

  Meteor._inherits(errorClass, Error);

  return errorClass;
};

// This should probably be in the livedata package, but we don't want
// to require you to use the livedata package to get it. Eventually we
// should probably rename it to DDP.Error and put it back in the
// 'livedata' package (which we should rename to 'ddp' also.)
//
// Note: The DDP server assumes that Meteor.Error EJSON-serializes as an object
// containing 'error' and optionally 'reason' and 'details'.
// The DDP client manually puts these into Meteor.Error objects. (We don't use
// EJSON.addType here because the type is determined by location in the
// protocol, not text on the wire.)

/**
 * @summary This class represents a symbolic error thrown by a method.
 * @locus Anywhere
 * @class
 * @param {String} error A string code uniquely identifying this kind of error.
 * This string should be used by callers of the method to determine the
 * appropriate action to take, instead of attempting to parse the reason
 * or details fields. For example:
 *
 * ```
 * // on the server, pick a code unique to this error
 * // the reason field should be a useful debug message
 * throw new Meteor.Error("logged-out",
 *   "The user must be logged in to post a comment.");
 *
 * // on the client
 * Meteor.call("methodName", function (error) {
 *   // identify the error
 *   if (error.error === "logged-out") {
 *     // show a nice error message
 *     Session.set("errorMessage", "Please log in to post a comment.");
 *   }
 * });
 * ```
 *
 * For legacy reasons, some built-in Meteor functions such as `check` throw
 * errors with a number in this field.
 *
 * @param {String} [reason] Optional.  A short human-readable summary of the
 * error, like 'Not Found'.
 * @param {String} [details] Optional.  Additional information about the error,
 * like a textual stack trace.
 */
Meteor.Error = Meteor.makeErrorType(
  "Meteor.Error",
  function (error, reason, details) {
    var self = this;

    // Currently, a numeric code, likely similar to a HTTP code (eg,
    // 404, 500). That is likely to change though.
    self.error = error;

    // Optional: A short human-readable summary of the error. Not
    // intended to be shown to end users, just developers. ("Not Found",
    // "Internal Server Error")
    self.reason = reason;

    // Optional: Additional information about the error, say for
    // debugging. It might be a (textual) stack trace if the server is
    // willing to provide one. The corresponding thing in HTTP would be
    // the body of a 404 or 500 response. (The difference is that we
    // never expect this to be shown to end users, only developers, so
    // it doesn't need to be pretty.)
    self.details = details;

    // This is what gets displayed at the top of a stack trace. Current
    // format is "[404]" (if no reason is set) or "File not found [404]"
    if (self.reason)
      self.message = self.reason + ' [' + self.error + ']';
    else
      self.message = '[' + self.error + ']';
  });

// Meteor.Error is basically data and is sent over DDP, so you should be able to
// properly EJSON-clone it. This is especially important because if a
// Meteor.Error is thrown through a Future, the error, reason, and details
// properties become non-enumerable so a standard Object clone won't preserve
// them and they will be lost from DDP.
Meteor.Error.prototype.clone = function () {
  var self = this;
  return new Meteor.Error(self.error, self.reason, self.details);
};

// From https://github.com/meteor/meteor/blob/832e6fe44f3635cae060415d6150c0105f2bf0f6/packages/meteor/dynamics_browser.js
var nextSlot = 0;
var currentValues = [];

Meteor.EnvironmentVariable = function () {
  this.slot = nextSlot++;
};

_.extend(Meteor.EnvironmentVariable.prototype, {
  get: function () {
    return currentValues[this.slot];
  },

  getOrNullIfOutsideFiber: function () {
    return this.get();
  },

  withValue: function (value, func) {
    var saved = currentValues[this.slot];
    try {
      currentValues[this.slot] = value;
      var ret = func();
    } finally {
      currentValues[this.slot] = saved;
    }
    return ret;
  }
});

module.exports = Meteor;
