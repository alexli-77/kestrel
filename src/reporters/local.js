"use strict";

function createLocalReporter() {
  return {
    name: "local",
    async started(payload) {
      console.error(payload.content);
    },
    async finished(payload) {
      console.error(payload.content);
    },
    async alert(payload) {
      console.error(payload.content);
    },
  };
}

module.exports = { createLocalReporter };
