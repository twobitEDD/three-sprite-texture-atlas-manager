/**
Describes a rectangular area witin the knapsack. Abstracts the basic math away from the {@link module:texture-manager/knapsack/node|`KnapsackNode`} module.

@module texture-manager/knapsack/rectangle
*/

/**
 * @constructor
 * @param {integer} left - Left most pixel index of this rectangle (0 to `right` - 1 )
 * @param {integer} top - Top most pixel index of this rectangle (0 to `bottom` - 1 )
 * @param {integer} right - Right most pixel index of this rectangle
 * @param {integer} bottom - Bottom most pixel index of this rectangle
*/

class KnapsackRectangle {
  constructor( left, top, right, bottom ) {
    this.left   = Math.floor( ( typeof left   === `number` && isFinite( left   ) ) ? left   : 0 );
    this.top    = Math.floor( ( typeof top    === `number` && isFinite( top    ) ) ? top    : 0 );
    this.right  = Math.floor( ( typeof right  === `number` && isFinite( right  ) ) ? right  : 0 );
    this.bottom = Math.floor( ( typeof bottom === `number` && isFinite( bottom ) ) ? bottom : 0 );
  }

  /**
   * The center X coordinate of this rectangle.
   * @type {integer}
   * @readonly
   */
  get Xcentre () { return Math.floor( ( ( this.right - this.left ) / 2 ) + this.left ) - 0.5; }

  /**
   * The center Y coordinate of this rectangle.
   * @type {integer}
   * @readonly
   */
  get Ycentre () { return Math.floor( ( ( this.bottom - this.top ) / 2 ) + this.top  ) - 0.5; }

  /**
   * The width of this rectangle in pixels.
   * @type {integer}
   * @readonly
   */
  get width ()  { return ( this.right - this.left ); }

  /**
   * The height of this rectangle in pixels.
   * @type {integer}
   * @readonly
   */
  get height () { return ( this.bottom - this.top ); }
}

/**
Represents a single rectangular area "node" within a texture atlas canvas, which may have its own {@link external:Texture|`THREE.Texture`} with the UV coordinates managed for you. These nodes are created through {@link module:texture-manager#allocateNode|`allocateNode()`}.

The implementation is based on [http://www.blackpawn.com/texts/lightmaps/default.html](http://www.blackpawn.com/texts/lightmaps/default.html). Visit that page for a good impression of what we're achieving here.

See http://jsfiddle.net/Shiari/sbda72k9/ for a more complete and working example than the one below.

@module texture-manager/knapsack/node
@example
tetureManager.allocateNode( 100, 20 ).then(
  function( node ) {
    // Do something with the node in this Promise, like create
    // a sprite.
  },
  function( error ) {
    // Promise was rejected
    console.error( "Could not allocate node:", error );
  }
);
*/

/**
 * Do not use this directly, it is managed for you.
 * @constructor
 * @param {Knapsack} - The {@link module:texture-manager/knapsack|`Knapsack`} this node is to become a part of.
 */
class KnapsackNode {
  constructor( knapsack ) {
    /**
     * Reference to the {@link module:texture-manager/knapsack|`Knapsack`} this node is a part of
     * @type {Knapsack}
     * @private
     * @readonly
     * @category provider
     */
    this.knapsack = knapsack;

    /**
     * Optional reference to the "left" side {@link module:texture-manager/knapsack/node|`KnapsackNode`} branch of the tree of nodes.
     * @type {KnapsackNode}
     * @private
     * @readonly
     * @category provider
     */
    this.leftChild = null;

    /**
     * Optional reference to the "right" side {@link module:texture-manager/knapsack/node|`KnapsackNode`} branch of the tree of nodes.
     * @type {KnapsackNode}
     * @private
     * @readonly
     * @category provider
     */
    this.rightChild = null;

    /**
     * Describes the coordinates which are the boundaries of this node.
     * @type {KnapsackRectangle}
     * @private
     * @readonly
     * @category information
     */
    this.rectangle = null;
    // Overwritten when children are created, but done as a default here to keep
    // the code cleaner. Instantiating this object is pretty cheap anyway.
    this.rectangle = new KnapsackRectangle( 0, 0, knapsack.textureSize, knapsack.textureSize );

    /**
     * Internal unique ID for the image this node represents.
     * @type {string}
     * @private
     * @readonly
     * @category information
     */
    this.imageID = null;

    this._texture = null;
  }

  /**
   * The HTML `<canvas>` element as supplied by the {@link module:texture-manager/knapsack|`Knapsack`} which this node is part of.
   * @type {external:canvas}
   * @readonly
   * @category provider
   */
  get canvas () { return this.knapsack.canvas; }

  /**
   * Convenience accessor for the {@link external:CanvasRenderingContext2D} which is associated with the {@link module:texture-manager/knapsack/node#canvas}. You can use this context to draw on the entire canvas, but you'll probably want to use {@link module:texture-manager/knapsack/node#clipContext|`clipContext()`} instead.
   * @type {external:CanvasRenderingContext2D}
   * @readonly
   * @category provider
   */
  get context () { return this.knapsack.canvas.getContext(`2d`); }

  /**
   * The width in pixels of this sprite's texture node.
   * @type {integer}
   * @readonly
   * @category information
   * @example
   * textureManager.allocateNode( 30, 10 ).then( function( node ) {
   *   console.log( node.width ); // => 30
   * });
   */
  get width () { return this.rectangle.width; }

  /**
   * The height in pixels of this sprite's texture node.
   * @type {integer}
   * @readonly
   * @category information
   * @example
   * textureManager.allocateNode( 30, 10 ).then( function( node ) {
   *   console.log( node.height ); // => 10
   * });
   */
  get height () { return this.rectangle.height; }

  /**
   * Lazily built {@link external:Texture|`THREE.Texture`}, with it's UV coordinates already set for you. You can pass this texture straight to your material, and the GPU memory it requires should be shared with all other texture nodes on the same texture.
   * @type {external:Texture}
   * @readonly
   * @category provider
   * @example
   * var material = new THREE.SpriteMaterial({
   *   map: node.texture,
   *   transparent: true,
   *   blending: THREE.AdditiveBlending
   * });
   * var sprite = new THREE.Sprite( material );
   * scene.add( sprite );
   */
  get texture () {
    if ( ! this._texture ) {
      this._texture = this.knapsack.rootTexture.clone();
      this._texture.uuid = this.knapsack.rootTexture.uuid;
      var uvs = this.uvCoordinates();
      this.texture.offset.x = uvs[ 0 ];
      this.texture.offset.y = uvs[ 1 ];
      this.texture.repeat.x = uvs[ 2 ] - uvs[ 0 ];
      this.texture.repeat.y = uvs[ 3 ] - uvs[ 1 ];
    }
    return this._texture;
  }

  /**
   * Returns true if this node has any children, which means it's not available to be drawn in. Its children may be suitable for this though.
   * @returns {boolean}
   * @category information
   * @private
   */
  hasChildren() {
    return ( ( this.leftChild !== null ) || ( this.rightChild !== null ) );
  }

  /**
   * Returns true if this node is available to be used by a texture (i.e. it's not yet been claimed by {@link module:texture-manager/knapsack/node#claim|`claim()`}.
   * @returns {boolean} Indicates whether this node has been claimed or not.
   * @category information
   * @private
   */
  isOccupied() {
    return ( this.imageID !== null );
  }

  /**
   * The UV coordinates which describe where in the texture this node is located. This is probably not of any practical use to you as a user of this library; it is used internally to map the texture correctly to a sprite.
   * @returns {Array} Array with [ left, top, right, bottom ] coordinates.
   * @category information
   * @example
   * var uvs = node.uvCoordinates();
   * var left   = uvs[ 0 ];
   * var top    = uvs[ 1 ];
   * var right  = uvs[ 2 ];
   * var bottom = uvs[ 3 ];
   */
  uvCoordinates() {
    var size = this.knapsack.textureSize;
    return [
          ( this.rectangle.left   / size ),
      1 - ( this.rectangle.bottom / size ),
          ( this.rectangle.right  / size ),
      1 - ( this.rectangle.top    / size ),
    ];
  }

  /**
   * Release this node back to the {@link module:texture-manager/knapsack|`Knapsack`} where it is contained. This makes it available to be used by new sprites. Only nodes without children can be released, but a user of this library will only get these leaf nodes returned. Branch nodes are used internally only.
   * @category allocation
   * @example
   * node.release();
   * // or, if you like typing:
   * textureManager.release( node );
   */
  release() {
    if ( this.hasChildren() ) {
      throw new Error( `Can not release tree node, still has children` );
    }

    if ( this._texture !== null ) {
      this._texture.dispose();
      this._texture = null;
    }

    this.clear();
    this.imageID = null;

    return;
  }

  /**
   * Clear the area of this node: it erases the context so that it is empty and transparent, and ready to be drawn to.
   * @category drawing
   * @example
   * // Erase the contents of the sprite
   * node.clear();
   */
  clear() {
    this.context.clearRect( this.rectangle.left, this.rectangle.top, this.width - 1, this.height - 1 );
  }

  /**
   * Set the drawing context tailored towards the area of the sprite, clipping anything outside of it. When done drawing, use {@link module:texture-manager/knapsack/node#restoreContext|`restoreContext()`} to restore the original drawing context.
   * @returns {CanvasRenderingContext2D} Render context configured exclusively for the sprite we're working on.
   * @category drawing
   * @example
   * var context = node.clipContext();
   * // Draw a 5px border along the edge of the sprite, some
   * // of it will fall outside the area, but it is clipped.
   * context.lineWidth = 5.0;
   * context.strokeStyle = 'rgba(255,0,0,1)';
   * context.strokeRect( 0, 0, node.width, node.height );
   * // other drawing commands
   * node.restoreContext();
   */
  clipContext() {
    var ctx = this.context;
    ctx.save();
    ctx.beginPath();
    ctx.rect( this.rectangle.left + 1, this.rectangle.top + 1, this.width - 2, this.height - 2 );
    ctx.clip();
    ctx.translate( this.rectangle.Xcentre, this.rectangle.Ycentre );
    return ctx;
  }

  /**
   * Restore the draw context of the {@link module:texture-manager/knapsack/node#canvas|`canvas`}. Call this when done drawing the sprite.
   * @category drawing
   * @example
   * var context = node.clipContext();
   * // Draw a 5px border along the edge of the sprite, some
   * // of it will fall outside the area, but it is clipped.
   * context.lineWidth = 5.0;
   * context.strokeStyle = 'rgba(255,0,0,1)';
   * context.strokeRect( 0, 0, node.width, node.height );
   * // other drawing commands
   * node.restoreContext();
   */
  restoreContext() {
    this.context.restore();
  }

  /**
   * Allocate a node in this {@link module:texture-manager/knapsack|`Knapsack`} for the given width and height. This is the main workhorse of this library.
   * @param {integer} width
   * @param {integer} height
   * @returns {KnapsackNode} A new node which describes a rectangular area in the knapsack.
   * @ignore
   * @category allocation
   */
  allocate( width, height ) {
    // If we're not a leaf node
    if ( this.hasChildren() )
    {
      // then try inserting into our first child
      var newNode = this.leftChild.allocate( width, height );
      if ( newNode instanceof KnapsackNode ) {
        newNode.claim();
        return newNode;
      }

      // There was no room: try to insert into second child
      return this.rightChild.allocate( width, height );
    }
    else
    {
      // if there's already an image here, return
      if ( this.isOccupied() ) {
        return null;
      }

      // if this node is too small, give up here
      if ( ( width > this.width ) || ( height > this.height ) ) {
        return null;
      }

      // if we're just the right size, accept
      if ( width === this.width && height === this.height ) {
        this.claim();
        return this;
      }

      // otherwise, got to split this node and create some kids
      this.leftChild  = new KnapsackNode( this.knapsack );
      this.rightChild = new KnapsackNode( this.knapsack );

      // now decide which way to split
      var remainingWidth  = this.width  - width;
      var remainingHeight = this.height - height;

      if ( remainingWidth > remainingHeight )
      {
        // horizontal split
        this.leftChild.rectangle = new KnapsackRectangle(
          this.rectangle.left,
          this.rectangle.top,
          this.rectangle.left + width,
          this.rectangle.bottom
        );

        this.rightChild.rectangle = new KnapsackRectangle(
          this.rectangle.left + width,
          this.rectangle.top,
          this.rectangle.right,
          this.rectangle.bottom
        );
      }
      else
      {
        // vertical split
        this.leftChild.rectangle = new KnapsackRectangle(
          this.rectangle.left,
          this.rectangle.top,
          this.rectangle.right,
          this.rectangle.top + height
        );

        this.rightChild.rectangle = new KnapsackRectangle(
          this.rectangle.left,
          this.rectangle.top + height,
          this.rectangle.right,
          this.rectangle.bottom
        );
      }

      // Some crude painting to help troubleshooting
      if ( this.knapsack.textureManager.debug ) {
        var context = this.context;
        context.lineWidth = 4.0;
        context.strokeStyle = `rgba(255,0,0,1)`;
        context.strokeRect( this.leftChild.rectangle.left, this.leftChild.rectangle.top, this.leftChild.width, this.leftChild.height );

        context.lineWidth = 4.0;
        context.strokeStyle = `rgba(0,255,0,1)`;
        context.strokeRect( this.rightChild.rectangle.left, this.rightChild.rectangle.top, this.rightChild.width, this.rightChild.height );
      }

      // Recurse into the first child to continue the allocation
      return this.leftChild.allocate( width, height );
    }
  }

  /**
   * Claim the node to be in use by giving it a (unique) ID for an image, this prevents it from being used for another image. After calling this method it is ready to be drawn.
   * @ignore
   * @category allocation
   */
  claim() {
    this.imageID = THREE.Math.generateUUID();

    // Some crude painting to help troubleshooting
    if ( this.knapsack.textureManager.debug ) {
      var context = this.context;
      context.lineWidth = 2.0;
      context.strokeStyle = `rgba( 0, 0, 255, 1 )`;
      context.strokeRect( this.rectangle.left + 0.5, this.rectangle.top + 0.5, this.width - 1, this.height - 1 );
    }
  }
}

/**
Represents a single texture atlas with several sprites and its corresponding base {@link external:Texture|`THREE.Texture`}. You do not interact with this class directly, it is entirely managed for you by a {@link module:texture-manager|`TextureManager`} instance. Documented only to satisfy the curiosity of fellow developers stumbling upon this.

@module texture-manager/knapsack
 */

/**
  * @constructor
  * @param {TextureManager} textureManager - The {@link module:texture-manager|`TextureManager`} which created this `Knapsack`
  * @param {integer} size - The size of the texture
  */
class Knapsack {
  constructor( textureManager, size ) {
    this.textureManager = textureManager;
    this.textureSize = size;
    this.textureLoaded = false;
    this.rootNode = new KnapsackNode( this );
    // Lazy initialising these:
    this._rootTexture = null;
    this._canvas = null;
  }

  /**
   * Lazily built HTML `<canvas>` element for this `Knapsack`.
   * @type {external:canvas}
   * @readonly
   */
  get canvas () {
    if ( ! this._canvas ) {
      this._canvas = document.createElement(`canvas`);
      this._canvas.width  = this.textureSize;
      this._canvas.height = this.textureSize;
    }
    return this._canvas;
  }

  /**
   * Lazily built {@link external:Texture|`THREE.Texture`}, this is created as a "master" texture. Each node will get its own `.clone()`, which should be shared in memory.
   * @type {external:Texture}
   * @readonly
   */
  get rootTexture () {
    if ( ! this._rootTexture ) {
      this._rootTexture = new THREE.Texture( this.canvas, THREE.UVMapping );
    }
    return this._rootTexture;
  }

  /**
   * Proxy method, allocate a texture atlas node for a sprite image of `width` by `height` pixels.
   * @param {integer} width
   * @param {integer} height
   * @returns {external:Promise}
   */
  allocateNode( width, height ) {
    return this.rootNode.allocate( width, height );
  }
}

/**
Build and destroy "nodes" in your texture atlas easily. It builds one or more {@link module:texture-manager/knapsack|`Knapsack`} objects for you, each of which represent a separate square texture atlas with one or more sprite textures of a size defined by you.

@module texture-manager

@example
// From github:
// $ npm install --save-dev leeft/three-sprite-texture-atlas-manager
// from npm:
// $ npm install --save-dev three-sprite-texture-atlas-manager
//
// Through ES2015 (ES6) modules (highly recommended):
import TextureManager from 'three-sprite-texture-atlas-manager';
var textureManager = new TextureManager();

// Node.js or CommonJS require():
// then:
var TextureManager = require('three-sprite-texture-atlas-manager');
var textureManager = new TextureManager();

// global namespace
var textureManager = new window.threeSpriteAtlasTextureManager();
 *
 */

/**
  * @constructor
  * @param {integer} [size=1024] Optional size for the textures. Must be a power of two.
  * @example
  * // We want 512x512 pixel textures
  * var textureManager = new TextureManager( 512 );
  * ...
  * textureManager.allocateNode( ... );
  */
class TextureManager {
  constructor( size ) {
    /**
     * The size of the textures as was validated when constructing the object.
     * @namespace module:texture-manager~TextureManager#size
     * @type {integer}
     * @ignore
     * @category readonly
     */
    this.size = ( ( typeof size === `number` ) && /^(128|256|512|1024|2048|4096|8192|16384)$/.test( size ) ) ? size : 1024;

    /**
     * As the texture manager allocates nodes, it creates a new {@link module:texture-manager/knapsack|`Knapsack`} when it needs to provide space for nodes. This is an array with all the knapsacks which have been created.
     * @namespace module:texture-manager~TextureManager#knapsacks
     * @type {Knapsack[]}
     * @readonly
     * @category readonly
     * @example
     * // Show the canvases in the DOM element with id="canvases"
     * // (you'd normally do this from the browser console)
     * textureManager.knapsacks.forEach( function( knapsack ) {
     *   document.getElementById('canvases').appendChild( knapsack.canvas );
     * });
     */
    this.knapsacks = [];

    /**
     * The debug property can be set to `true` after instantiating the object, which will make the {@link module:texture-manager/knapsack/node|`KnapsackNode`} class draw outlines as it allocates nodes. This can make it much more obvious what is going on, such as whether your text is properly sized and centered.
     * @namespace module:texture-manager~TextureManager#debug
     * @type {boolean}
     * @example
     * textureManager.debug = true;
     */
    this.debug = false;
  }

  /**
   * Add a new knapsack to the texture manager.
   * @param {integer} size
   * @returns {Knapsack}
   * @ignore
   */
  _addKnapsack( size ) {
    var knapsack = new Knapsack( this, size );
    this.knapsacks.push( knapsack );
    if ( this.debug ) {
      console.log( `TextureManager: allocated ${ this.textureSize }px texture map #${ this.knapsacks.length }` );
    }
    return knapsack;
  }

  /**
   * The actual used size of the texture.
   * @type {integer}
   * @readonly
   * @category readonly
   */
  get textureSize () {
    return this.size;
  }

  /**
   * Allocate a texture atlas node for a sprite image of `width` by `height` pixels. Unlike allocateNode, it does not return a {external:Promise} and it works synchronously.
   * @param {integer} width
   * @param {integer} height
   * @returns {KnapsackNode}
   * @category allocation
   * @throws {Error} The given with and height must fit in the texture.
   * @example
   * let node = textureManager.allocate( 100, 20 );
   */
  allocate( width, height ) {
    // Prevent allocating knapsacks when there's no chance to fit the node
    // FIXME TODO: try a bigger texture size if it doesn't fit?
    this._validateSize( width, height );
    return this._allocate( width, height );
  }

  /**
   * {external:Promise} based version of {@link allocate}.
   *
   * This method will require you to use a {external:Promise} polyfill if you want to support IE11 or older, as that browser doesn't support promises natively.
   * @param {integer} width
   * @param {integer} height
   * @returns {external:Promise}
   * @category allocation
   * @example
   * textureManager.allocateNode( 100, 20 ).then(
   *   function( node ) {
   *     // Do something with the node in this Promise, such as
   *     // creating a sprite and adding it to the scene.
   *   },
   *   function( error ) {
   *     // Promise was rejected
   *     console.error( "Could not allocate node:", error );
   *   }
   * );
   */
  allocateNode( width, height ) {
    return new Promise( ( resolve, reject ) => {
      try {
        // Prevent allocating knapsacks when there's no chance to fit the node
        // FIXME TODO: try a bigger texture size if it doesn't fit?
        this._validateSize( width, height );
        resolve( this._allocate( width, height ) );
      } catch ( error ) {
        reject( error );
      }
    });
  }

  /**
   * Asynchronously allocate a texture atlas node for a sprite image of `width` by `height` pixels. Returns a result through resolving the promise. The asynchronous approach will potentially allow for better optimisation of packing nodes in the texture space.
   *
   * When done adding nodes, you should call {@link solveASync}. Your queued promises will then be settled. But note that the {external:Promise} will still be rejected straight away if the given width or height don't fit.
   * @param {integer} width
   * @param {integer} height
   * @returns {external:Promise}
   * @category allocation
   * @example
   * // First prepare all your node allocations:
   * [ 1, 2, 3 ].forEach( function() {
   *   textureManager.allocateASync( 100, 20 ).then(
   *     function( node ) {
   *       // Do something with the node in this Promise, such as
   *       // creating a sprite and adding it to the scene.
   *       // Note: this promise won't succesfully settle until
   *       // after you also called solveASync!
   *     },
   *     function( error ) {
   *       // Promise was rejected
   *       console.error( "Could not allocate node:", error );
   *     }
   *   );
   * });
   * // Then resolve all the outstanding allocations:
   * textureManager.solveASync().then( function( result ) {
   *   console.log( `${ result.length } allocations have resolved` );
   * });
   */
  allocateASync( width, height ) {
    if ( ! Array.isArray( this._queue ) ) {
      this._queue = [];
    }

    let queueEntry;

    const promise = new Promise( ( resolve, reject ) => {
      try {
        // Prevent allocating knapsacks when there's no chance to fit the node
        // FIXME TODO: try a bigger texture size if it doesn't fit?
        this._validateSize( width, height );
        // Queue our resolution, which will be settled with .solveASync()
        queueEntry = {
          resolve: resolve,
          reject: reject,
          width: width,
          height: height,
        };
      }
      catch ( error ) {
        reject( error );
      }
    });

    if ( queueEntry ) {
      queueEntry.promise = promise;
      this._queue.push( queueEntry );
    }

    return promise;
  }

  /**
   * Trigger resolution of any outstanding node allocation promises, i.e. those that have been created with {@link allocateASync}. Call this when you've added nodes, or their promises will not settle.
   *
   * This is by design, as postponing of the node allocation makes it possible for the texture manager to optimise packing of the texture space in the most efficient manner possible.
   * @returns {external:Promise}
   * @category allocation
   * @throws {Error} You're trying to resolve a queue which hasn't been set up. Call {@link allocateASync} at least once before calling this.
   * @example
   * textureManager.solveASync().then( function( count ) {
   *   console.log( `${ count } node allocations have been resolved` );
   * });
   */
  solveASync() {
    /*eslint no-unused-vars: 0*/
    if ( ! Array.isArray( this._queue ) ) {
      throw new Error( `You're trying to resolve a queue which hasn't been set up. Call allocateASync before using this.` );
    }

    const promises = [];

    this._queue.forEach( entry => {
      const { promise: promise, resolve: resolve, reject: reject, width: width, height: height } = entry;
      const node = this._allocate( width, height );
      resolve( node );
      promises.push( promise );
    });

    this._queue = [];

    return Promise.all( promises );
  }

  /**
   * Low level helper to assert whether the given width and height will fit.
   * @param {integer} width
   * @param {integer} height
   * @category allocation
   * @throws {Error} Width of <number> is too large for these textures.
   * @throws {Error} Height of <number> is too large for these textures.
   * @private
   * @ignore
   */
  _validateSize( width, height ) {
    if ( width > this.textureSize ) {
      throw new Error( `Width of ${ width } is too large for these textures` );
    }

    if ( height > this.textureSize ) {
      throw new Error( `Height of ${ height } is too large for these textures` );
    }
  }

  /**
   * Low level helper to allocate a texture atlas node for a sprite image of `width` by `height` pixels.
   * @param {integer} width
   * @param {integer} height
   * @returns {KnapsackNode}
   * @category allocation
   * @private
   * @ignore
   */
  _allocate( width, height ) {
    let node = null;

    // First try to get a node from the existing knapsacks
    this.knapsacks.forEach( knapsack => {
      if ( node === null || node === undefined ) {
        node = knapsack.allocateNode( width, height );
      }
    });

    // Didn't get a node yet but it *should* fit, so make a new texture atlas with the same size
    if ( node === null ) {
      let knapsack = this._addKnapsack( this.textureSize );
      node = knapsack.allocateNode( width, height );
    }

    return node;
  }

  /**
   * Release the given node.
   * @param {KnapsackNode} node
   * @category allocation
   * @example
   * textureManager.release( node );
   */
  release( node ) {
    if ( node ) {
      node.release();
    }
  }
}

export default TextureManager;