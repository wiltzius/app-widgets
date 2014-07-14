/*
 * Copyright (c) 2014 The Polymer Project Authors. All rights reserved.
 * This code may only be used under the BSD style license found at http://polymer.github.io/LICENSE.txt
 * The complete set of authors may be found at http://polymer.github.io/AUTHORS.txt
 * The complete set of contributors may be found at http://polymer.github.io/CONTRIBUTORS.txt
 * Code distributed by Google as part of the polymer project is also
 * subject to an additional IP rights grant found at http://polymer.github.io/PATENTS.txt
 */

(function(scope) {

  /*

    Elements are added to a registration queue so that they register in 
    the proper order at the appropriate time. We do this for a few reasons:

    * to enable elements to load resources (like stylesheets) 
    asynchronously. We need to do this until the platform provides an efficient
    alternative. One issue is that remote @import stylesheets are 
    re-fetched whenever stamped into a shadowRoot.

    * to ensure elements loaded 'at the same time' (e.g. via some set of
    imports) are registered as a batch. This allows elements to be enured from
    upgrade ordering as long as they query the dom tree 1 task after
    upgrade (aka domReady). This is a performance tradeoff. On the one hand,
    elements that could register while imports are loading are prevented from 
    doing so. On the other, grouping upgrades into a single task means less
    incremental work (for example style recalcs),  Also, we can ensure the 
    document is in a known state at the single quantum of time when 
    elements upgrade.

  */
  var queue = {
    // tell the queue to wait for an element to be ready
    wait: function(element, check, go) {
      var shouldAdd = (this.indexOf(element) === -1 && 
          flushQueue.indexOf(element) === -1);
      if (shouldAdd) {
        this.add(element);
        element.__check = check;
        element.__go = go;
      }
      return (this.indexOf(element) !== 0);
    },
    add: function(element) {
      //console.log('queueing', element.name);
      queueForElement(element).push(element);
    },
    indexOf: function(element) {
      var i = queueForElement(element).indexOf(element);
      if (i >= 0 && document.contains(element)) {
        i += (HTMLImports.useNative || HTMLImports.ready) ? 
          importQueue.length : 1e9;
      }
      return i;  
    },
    // tell the queue an element is ready to be registered
    go: function(element) {
      var readied = this.remove(element);
      if (readied) {
        this.addToFlushQueue(readied);
        this.check();
      }
    },
    remove: function(element) {
      var i = this.indexOf(element);
      if (i !== 0) {
        //console.warn('queue order wrong', i);
        return;
      }
      return queueForElement(element).shift();
    },
    check: function() {
      // next
      var element = this.nextElement();
      if (element) {
        element.__check.call(element);
      }
      if (this.canReady()) {
        this.ready();
        return true;
      }
    },
    nextElement: function() {
      return nextQueued();
    },
    canReady: function() {
      return !this.waitToReady && this.isEmpty();
    },
    isEmpty: function() {
      return !importQueue.length && !mainQueue.length;
    },
    addToFlushQueue: function(element) {
      flushQueue.push(element);  
    },
    flush: function() {
      var element;
      while (flushQueue.length) {
        element = flushQueue.shift();
        element.__go.call(element);
        element.__check = element.__go = null;
      }
    },
    ready: function() {
      this.flush();
      // TODO(sorvell): As an optimization, turn off CE polyfill upgrading
      // while registering. This way we avoid having to upgrade each document
      // piecemeal per registration and can instead register all elements
      // and upgrade once in a batch. Without this optimization, upgrade time
      // degrades significantly when SD polyfill is used. This is mainly because
      // querying the document tree for elements is slow under the SD polyfill.
      if (CustomElements.ready === false) {
        CustomElements.upgradeDocumentTree(document);
        CustomElements.ready = true;
      }
      Platform.flush();
      requestAnimationFrame(this.flushReadyCallbacks);
    },
    addReadyCallback: function(callback) {
      if (callback) {
        readyCallbacks.push(callback);
      }
    },
    flushReadyCallbacks: function() {
      if (readyCallbacks) {
        var fn;
        while (readyCallbacks.length) {
          fn = readyCallbacks.shift();
          fn();
        }
      }
    },
    waitToReady: true
  };

  var flushQueue = [];

  var importQueue = [];
  var mainQueue = [];
  var readyCallbacks = [];

  function queueForElement(element) {
    return document.contains(element) ? mainQueue : importQueue;
  }

  function nextQueued() {
    return importQueue.length ? importQueue[0] : mainQueue[0];
  }

  var polymerReadied = false; 

  document.addEventListener('WebComponentsReady', function() {
    CustomElements.ready = false;
  });
  
  function whenPolymerReady(callback) {
    queue.waitToReady = true;
    CustomElements.ready = false;
    HTMLImports.whenImportsReady(function() {
      queue.addReadyCallback(callback);
      queue.waitToReady = false;
      queue.check();
    });
  }

  // exports
  scope.queue = queue;
  scope.whenReady = scope.whenPolymerReady = whenPolymerReady;
})(Polymer);
