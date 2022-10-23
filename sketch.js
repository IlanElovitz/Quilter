/* Todo:
Bugs:
freezing during selection (infinite looping?)

Small Features:
change scale
show and hide grid
download pattern as image
randomize colors?
fill area?
unsubdivide
rearrange menu
different way of indicating empty squares or show white color


top bar: select tool mode, show block grid, change scale, undo redo, save and load, download as image, randomize colors, 
bottom menu color: current block colors, 
bottom menu draw: current color, show hide grid
corner menu: transforms, fill, subdivide, unsubdivide, translate x and y

Two modes, draw and block,
draw is the current mode.
block allows you to select blocks and adjust alternate colors, and transforms change the layout. 
Potentially also having multiple different quilt blocks in a pattern?

Big Features:
load basic patterns
Accessibility
variable color patterns
clean up and comment code
pattern to piecing - calculate how much fabric
rectangular blocks?
load image as pattern
image backgrounds
mobile support
*/

// Global Variable Declarations ------------------------------------------------------------------------
//#region 

let squareScale; //side length of tiles are displayed at
let displayScale;

let patternW; //tiles in pattern width
let patternH; //tiles in pattern height
let patternSizeX; //patternW*squareScale - pattern block absolute display width
let patternSizeY; //patternH*squareScale
let pattern_array; //2D array containing the tiles of the pattern block
let mouseTimer;
let holdBuffer = 250;
let margin
let mousePatternX
let mousePatternY

let colorScheme; //object containing the colors in the pattern
let currentColor; //the current color for editing the pattern
let pickerPosition; //order number for the next new picker in colors container

let W; //number of pattern blocks to display in x direction
let H; //number of pattern blocks to display in y direction

let pattern_g; // pattern graphics buffer

// full english alphabet (all caps) for generating color id's
const alphabet = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
  "M",
  "N",
  "O",
  "P",
  "Q",
  "R",
  "S",
  "T",
  "U",
  "V",
  "W",
  "X",
  "Y",
  "Z"
];

// enum for layout block transforms
const LayoutTransforms = {
  none: 0,
  rotate90: 1,
  rotate180: 2,
  rotate270: 3,
  flipHorizontal: 4,
  flipVertical: 5,
  flipRightDiagonal: 6,
  flipLeftDiagonal: 7,
};

// enum for edit modes
const Modes = { draw : 0, block : 1}
let currentMode = 1; // current edit mode

// BLock mode
let selectionBlocks = []//["0,0","1,0","2,0","0,1","2,1","0,2","2,2"]
let selectionPolygons = []
let antiSelectionPolygons = []
let dashOffset = 0
let selectX
let selectY
let selectW
let selectH

let shiftDown = false
let ctrlDown = false
let altDown = false

let layout_array;
let layoutDiv;

// DOM elements
let colorsDiv;
let bottomDiv;
let currentColorPicker;
let fileNameInput;
let uploadInput;
let root;

// history system
let history; //stack of actions that undo pulls from
let future; //stack of actions populated by undo, that redo pulls from
let currentColors; //placeholder to store the current state of colorScheme since color changes are logged to history after they have already been changed
let patternBefore; //placeholder to store the state of the pattern before drawing triangles begins, so that it can be logged in history after a stroke
//#endregion


// Functions for displaying the quilt on the canvas ----------------------------------------------------
//#region

/*
Print a single square or tile to the pattern block buffer, 
S is the 3 char string of the tile
buffer is the graphics buffer to print to
*/
function printSquare(S, buffer, x, y) {
  let tile;

  /* 
  Tiles are strings in the following forms, where A and B are the id's of two colors:
  "-A-" indicates a tile filled completely with one color
  "A/B" indicates a tile where the NW triangle is filled with color A and the SE triangle with color B
  "A\B" indicates a tile where the SW triangle is filled with color A and the NE triangle with color B
  The following regex match will draw the appropriate tile to the graphics buffer, at the given x and y
  */
  tile = S.match(/-([A-Z]+|_)-/);
  if (tile) {
    buffer.fill(colorScheme[tile[1]]);
    buffer.square(x, y, squareScale);
  }
  tile = S.match(/([A-Z]+|_)\/([A-Z]+|_)/);
  if (tile) {
    buffer.fill(colorScheme[tile[1]]);
    buffer.triangle(
      x,
      y,
      x + squareScale,
      y,
      x,
      y + squareScale
    );
    buffer.fill(colorScheme[tile[2]]);
    buffer.triangle(
      x + squareScale,
      y + squareScale,
      x + squareScale,
      y,
      x,
      y + squareScale
    );
  }
  tile = S.match(/([A-Z]+|_)\\([A-Z]+|_)/);
  if (tile) {
    buffer.fill(colorScheme[tile[1]]);
    buffer.triangle(
      x,
      y,
      x,
      y + squareScale,
      x + squareScale,
      y + squareScale
    );
    buffer.fill(colorScheme[tile[2]]);
    buffer.triangle(
      x,
      y,
      x + squareScale,
      y,
      x + squareScale,
      y + squareScale
    );
  }
}

/*
Print the entire pattern block to the offscreen buffer
array is the pattern block
buffer is the graphics buffer to print to
*/
function printPattern(array, buffer) {
  buffer.noStroke();
  let cursorX = 0;
  let cursorY = 0;

  array.forEach(function (x) {
    x.forEach(function (y) {
      printSquare(y, buffer, cursorX, cursorY);
      cursorX += squareScale;
    });
    cursorX -= patternSizeX;
    cursorY += squareScale;
  });
}

/*
Display the grid of pattern blocks on the canvas.
graphic is the offscreen buffer storing the pattern block
w, h are the number of blocks to print
*/
function printQuilt(graphic, w, h) {
  let scaleX 
  let scaleY
  let rotateD = 0;
  let layoutX = 0;
  let layoutY = 0;
  let n;
  let m;

  for (let i = 0; i < h; i++) {
    for (let j = 0; j < w; j++) {
      scaleX = 1;
      scaleY = 1;
      rotateD = 0;

      /*
      the corresponding layout tile to the current block being printed will determine what transform to apply
      to that tile.
      transforms affect the entire canvas, so the position where the quilt block needs to be printed must be adjusted
      so that the quilt block is printed in the appropriate location.
      depending on the current layout, n and m are set to some modified version of i and j to make this happen.
      */
      switch (layout_array[layoutY][layoutX]) {
        case 0:
          n = i;
          m = j;
          break;

        case 1:
          n = -j - 1;
          m = i;
          rotateD = 90;
          break;

        case 2:
          m = -j - 1;
          n = -i - 1;
          rotateD = 180;
          break;

        case 3:
          m = -i - 1;
          n = j;
          rotateD = 270;
          break;

        case 4:
          n = i;
          m = j + 1;
          scaleX = -1;
          break;

        case 5:
          n = i + 1;
          m = j;
          scaleY = -1;
          break;

        case 6:
          n = -j - 1;
          m = i + 1;
          scaleX = -1;
          rotateD = 90;
          break;

        case 7:
          m = -i;
          n = j;
          scaleX = -1;
          rotateD = 270;
          break;
      }

      let cursorY = patternSizeY * n;
      let cursorX = patternSizeX * m;

      push();
      rotate(rotateD);
      scale(scaleX, scaleY);
      image(graphic, cursorX * scaleX, cursorY * scaleY);
      pop();

      // next layout
      layoutX = (layoutX + 1) % layout_array[layoutY].length;
    }

    //next layout
    layoutY = (layoutY + 1) % layout_array.length;
    layoutX = 0;
  }
}
//#endregion


// Functions for drawing triangles onto the quilt pattern in Draw mode ---------------------------------
//#region

/*
Return the quarter tile within a pattern block that the mouse is currently hovering over
*/
function currentTileDouble() {
  let tile2X;
  let tile2Y;

  // the position of the mouse relative to the pattern block that it's over
  let patternX = mousePatternX % patternSizeX;
  let patternY = mousePatternY % patternSizeY;

  // the current layout tile of the given pattern block
  let layoutY = Math.floor(mousePatternY / patternSizeY) % layout_array.length;
  let layoutX = Math.floor(mousePatternX / patternSizeX) % layout_array[layoutY].length;
  let currentLayout = layout_array[layoutY][layoutX];

  /*
  Depending on the transform applied to the pattern block per the layout, the position of the mouse in
  canvas space must be modified to find it's postion relative to the pattern block space
  */
  let temp;
  switch (currentLayout) {
    case 1:
      temp = patternX;
      patternX = patternY;
      patternY = patternSizeX - temp;
      break;

    case 2:
      patternX = patternSizeX - patternX;
      patternY = patternSizeY - patternY;
      break;

    case 3:
      temp = patternX;
      patternX = patternSizeY - patternY;
      patternY = temp;
      break;

    case 4:
      patternX = patternSizeX - patternX;
      break;

    case 5:
      patternY = patternSizeY - patternY;
      break;

    case 6:
      temp = patternX;
      patternX = patternSizeY - patternY;
      patternY = patternSizeX - temp;
      break;

    case 7:
      temp = patternX;
      patternX = patternY;
      patternY = temp;
      break;
  }

  tile2X = Math.floor((patternX / squareScale) * 2);
  tile2Y = Math.floor((patternY / squareScale) * 2);

  /*
  fixes a bugs with cases where the mouse was on the edge between two blocks
  (I think this happens because counting ranges from >=0 to <n, and because of rotations, 
  two ends of blocks end up next to each other, so there was a gap between <n of two different blocks.
  This was the easiest fix)
  */
  if (tile2X >= patternW * 2) tile2X -= 1;
  if (tile2Y >= patternH * 2) tile2Y -= 1;

  return [tile2X, tile2Y];
}

/*
Draw the triangle cursor at mouse position
*/
function drawTriCursor(tileDouble, buffer) {
  buffer.stroke(0, 0, 0, 200);
  buffer.strokeWeight(squareScale / 6);
  buffer.noFill();

  // the postion of the tile in which the triangle will be drawn.
  // multiplied by squareScale will give the actual position of the top left corner of the tile.
  let tileX = Math.floor(tileDouble[0] / 2);
  let tileY = Math.floor(tileDouble[1] / 2);
  // 0 or 1 indicating which corner of the tile the triangle is located in.
  // eg. x=0, y=1 indicates a triangle in the SW corner.
  let rX = tileDouble[0] % 2;
  let rY = tileDouble[1] % 2;
  /*
  in order to take into account the stroke weight of the triangle cursor so it displays completely inside 
  each square, regardless of the squareScale, a weighted average is taken between the corners of the 
  triangle and the midpoint of the tile. factor1 is the weight applied to the coordinates that determine
  the orthogonal edges of the triangle, while factor2 is applied to the diagonal edge. 
  effectively, factor1 determines how close the triangle edges are the the edges of the square, while factor2
  determines how close the acute angled corners are to the corners of the square.
  */
  let midpointX = (tileX + 0.5) * squareScale;
  let midpointY = (tileY + 0.5) * squareScale;
  let factor1 = squareScale / 30 + 15 / 3;
  let factor2 = squareScale / 60 + 4 / 3;

  
  buffer.triangle(
    (squareScale * (tileX + rX) * factor1 + midpointX) / (factor1 + 1),
    (squareScale * (tileY + rY) * factor1 + midpointY) / (factor1 + 1),
    (squareScale * (tileX + ((rX + 1) % 2)) * factor2 + midpointX) / (factor2 + 1),
    (squareScale * (tileY + rY) * factor1 + midpointY) / (factor1 + 1),
    (squareScale * (tileX + rX) * factor1 + midpointX) / (factor1 + 1),
    (squareScale * (tileY + ((rY + 1) % 2)) * factor2 + midpointY) / (factor2 + 1)
  );
  // draw the white inner triangle of the cursor
  buffer.stroke(255, 255, 255, 200);
  buffer.strokeWeight(squareScale / 16);
  buffer.triangle(
    (squareScale * (tileX + rX) * factor1 + midpointX) / (factor1 + 1),
    (squareScale * (tileY + rY) * factor1 + midpointY) / (factor1 + 1),
    (squareScale * (tileX + ((rX + 1) % 2)) * factor2 + midpointX) /
      (factor2 + 1),
    (squareScale * (tileY + rY) * factor1 + midpointY) / (factor1 + 1),
    (squareScale * (tileX + rX) * factor1 + midpointX) / (factor1 + 1),
    (squareScale * (tileY + ((rY + 1) % 2)) * factor2 + midpointY) /
      (factor2 + 1)
  );
}

/*
Draw a triangle in the pattern block at the current mouse position
*/
function drawTriangle() {
  checkForNewColor();

  let tileDouble = currentTileDouble();
  let tileX = Math.floor(tileDouble[0] / 2);
  let tileY = Math.floor(tileDouble[1] / 2);
  // 0 or 1 based on the quadrant of the tile
  let quadX = tileDouble[0] % 2;
  let quadY = tileDouble[1] % 2;

  let previousTile = pattern_array[tileY][tileX];
  let tileArray = previousTile.split("");

  // if half the tile is already the current color, just fill in the rest
  if (tileArray.includes(currentColor)) {
    tileArray = ["-", currentColor, "-"];
  } else {
    // alter the current tile's array based on which quadrant of the tile you are clicking on
    // since tiles are stored like "A/B" or "A/B" only the x quadrant matters for which half of the tile should be changed
    if (quadX == 0) {
      tileArray[0] = currentColor;
      
      // if the current tile is a solid color ("-A[-]"), set the opposite triangle to that color
      if (tileArray[2] === "-") {
        tileArray[2] = tileArray[1];
      }
    } else {
      tileArray[2] = currentColor;

      // if the current tile is a solid color ("[-]A-"), set the opposite triangle to that color
      if (tileArray[0] === "-") {
        tileArray[0] = tileArray[1];
      }
    }

    // correct the slant of the triangles
    if ((quadX + quadY) % 2 == 0) {
      tileArray[1] = "/";
    } else {
      tileArray[1] = "\\";
    }

    // if both triangles are now the same color, change to a single color square
    if (tileArray[0] === tileArray[2]) tileArray = ["-", tileArray[0], "-"];
  }

  let newTile = tileArray.join("");

  pattern_array[tileY][tileX] = newTile;
}

/* 
Begin drawing in the canvas.
Called once when mousePressed on canvas.
*/
function beginDraw() {
  patternBefore = JSON.stringify(pattern_array);

  drawTriangle();

  // set the time to be greater than 0 so it begins counting
  mouseTimer = 0.1;
}

/*
Called once every frame, check whether to continue drawing in the pattern and update the mouse button hold timer.
*/
function continueDraw() {
  if (mouseIsPressed && mouseTimer > 0) {
    mouseTimer += deltaTime;
  }
  if (mouseIsPressed && mouseTimer >= holdBuffer) {
    if (mouseOverCanvas()) drawTriangle();
    else releaseDraw();
  }
}

/* 
Log drawing action in history stack when mouse is released.
Called once on mouseReleased.
*/
function releaseDraw() {
  if (mouseTimer > 0) {
    let currentPattern = JSON.stringify(pattern_array);
    let previousPattern = patternBefore;

    mouseTimer = 0;

    // only log history if something's changed
    if (previousPattern != currentPattern) {
      logAction(
        () => setPattern(JSON.parse(previousPattern)),
        () => setPattern(JSON.parse(currentPattern))
      );
    }
  }
}

//#endregion

// Functions for Block Mode ------------------------------------------
//#region 

function drawBlockCursor() {
  let modifierX
  let modifierY
  if (selectW < 1) modifierX = 1
  else modifierX = 0
  if (selectH < 1) modifierY = 1
  else modifierY = 0

  stroke(0, 0, 0, 200);
  strokeWeight(squareScale / 6);
  noFill();
  rect((selectX + modifierX) * patternSizeX, (selectY + modifierY) * patternSizeY, (selectW - modifierX) * patternSizeX, (selectH - modifierY) * patternSizeY)

  stroke(255, 255, 255, 200);
  strokeWeight(squareScale / 16);
  rect((selectX + modifierX) * patternSizeX, (selectY + modifierY) * patternSizeY, (selectW - modifierX) * patternSizeX, (selectH - modifierY) * patternSizeY)

  let icon = ""
  if (ctrlDown || shiftDown) icon = "+"
  else if (altDown) icon = "-"
  else icon = ""
  stroke(0, 0, 0, 200);
  strokeWeight(displayScale / 10)
  fill(255, 255, 255, 200);
  textSize(displayScale)
  textAlign(RIGHT)
  text(icon, selectX * patternSizeX + displayScale, selectY * patternSizeY + displayScale)
}

function beginSelect() {
  if (mouseOverCanvas()) {
    selectX = Math.floor(mousePatternX / (patternSizeX))  
    selectY = Math.floor(mousePatternY / (patternSizeY))
    selectW = 1
    selectH = 1
  } else {
    selectX = undefined
    selectY = undefined
  }
}

function updateSelect() {
  let currentX = Math.floor(mousePatternX / (patternSizeX))
  let currentY = Math.floor(mousePatternY / (patternSizeY))

  if (mouseIsPressed) {
    if (currentX >= selectX) selectW = currentX - selectX + 1
    else selectW = currentX - selectX
    if (currentY >= selectY) selectH = currentY - selectY + 1
    else selectH = currentY - selectY

    if (selectW + selectX < 0) selectW += 1
    if (selectW + selectX > W) selectW -= 1
    if (selectH + selectY < 0) selectH += 1
    if (selectH + selectY > H) selectH -= 1
  } else {
    beginSelect()
  }
}

function releaseSelect() {

  if (selectX == undefined || selectY == undefined) {
    return
  }

  let previousSelection = deepCopy(selectionBlocks)

  if (!ctrlDown && !shiftDown && !altDown) {
    selectionBlocks = []
    selectionPolygons = []
    antiSelectionPolygons = []
  } 


  for (let i = 0; (selectW > 0 && i < selectW) || (selectW < 0 && i >= selectW);) {
    for (let j = 0; (selectH > 0 && j < selectH) || (selectH < 0 && j >= selectH);) {
      let newBlock = (selectX + i) + "," + (selectY + j)

      if (selectX + i < 0 || selectY + j < 0 || selectX + i > W || selectY + j > H)  {
        j += Math.sign(selectH) 
        continue
      }

      if (altDown) {
        if (selectionBlocks.includes(newBlock)) {
          selectionBlocks.splice(selectionBlocks.indexOf(newBlock),1)
          polygons = polygonsFromBlocks(selectionBlocks)
          selectionPolygons = polygons[0]
          antiSelectionPolygons.push(...polygons[1])
        }
      } else if (!selectionBlocks.includes(newBlock)) {
        selectionBlocks.push(newBlock)
        x = addBlockToPolygons(newBlock, selectionPolygons)
        selectionPolygons = x[0]
        antiSelectionPolygons.push(...x[1])
      }      
      j += Math.sign(selectH)
    }
    i += Math.sign(selectW)
  }

  console.log(selectionBlocks)
  console.log(antiSelectionPolygons)

  let currentSelection = deepCopy(selectionBlocks)

  logAction(() => setSelection(previousSelection), () => setSelection(currentSelection))
}

function polygonsFromBlocks(blockList) {
  let polygonList = []
  let antipolygonList = []
  for (i in blockList) {
    polygons = addBlockToPolygons(blockList[i], polygonList)
    polygonList = polygons[0]
    antipolygonList.push(...polygons[1])

    console.log(polygonList)
  }

  return [polygonList, antipolygonList]
}

function polygonFromBlock(blockPos) {
  let square = []
  square_array = blockPos.split(",")
  square.push(blockPos)
  square.push((parseInt(square_array[0]) + 1) + "," + square_array[1])
  square.push((parseInt(square_array[0]) + 1) + ","  + (parseInt(square_array[1]) + 1))
  square.push(square_array[0] + ","  + (parseInt(square_array[1]) + 1))

  return square
}

function addBlockToPolygons(blockPos, polygonList) {
  polygonList = deepCopy(polygonList)

  let square = []
  square_array = blockPos.split(",")
  square.push(blockPos)
  square.push((parseInt(square_array[0]) + 1) + "," + square_array[1])
  square.push((parseInt(square_array[0]) + 1) + ","  + (parseInt(square_array[1]) + 1))
  square.push(square_array[0] + ","  + (parseInt(square_array[1]) + 1))

  return addPolygonToList(square, polygonList)
}

// TODO fix selection area with unselected inside
function addPolygonToList(polygon, polygonList) {
  polygonList = deepCopy(polygonList)
  let antipolygonList = []

  let matching = false;
  let newPolygonsList = []
  for (p in polygon) {
    let matchingPoly = polygonList.find(function(poly) {
      return poly.includes(polygon[p])
    })

    if (matchingPoly) {
      matching = true

      polygonList.splice(polygonList.indexOf(matchingPoly),1)
      for (q in polygon) {
        if (matchingPoly.includes(polygon[q])) {
          newPolygonsList.push(mergePolygons(matchingPoly, polygon, polygon[q]))
        }
      }
      
      newPolygonsList = newPolygonsList.filter((polygons, index) => index == 0 || !polygonEquals(polygons[0],newPolygonsList[0][0]))
      console.log(newPolygonsList)
      if (newPolygonsList.length == 1) {
        newPolygons = newPolygonsList[0]
      } else if (polygonInside(newPolygonsList[0][0],newPolygonsList[1][0])) {
        newPolygons = newPolygonsList[1]
        antipolygonList.push(newPolygonsList[0][0])
      } else if (polygonInside(newPolygonsList[1][0],newPolygonsList[0][0])) {
        newPolygons = newPolygonsList[0]
        antipolygonList.push(newPolygonsList[1][0])
      }
      //let newPolygons = mergePolygons(matchingPoly, polygon, polygon[p])
      
      // check against the other polygons for more merging
      x = addPolygonToList(newPolygons[0], polygonList)
      polygonList = x[0]
      antipolygonList.push(...x[1])
      if (newPolygons.length > 1) polygonList.push(newPolygons[1])

      break;
    }
  }
  if (!matching) {
    polygonList.push(polygon)
  }

  return [polygonList, antipolygonList]
}

/*
given two polygons and a point, merges the two polygons at the point if possible
and returns the merged polygons in an array
*/
function mergePolygons(polygonA, polygonB, point) {
  let i = polygonA.indexOf(point) // set to the starting index for the marching algorithm
  let startingPoint = point;
  let started = false;
  let loopingShape = polygonA // algorithm marches around the points of the polygons, starting with polygonA
  let newPolygon = []
  console.log(polygonA + "   " + polygonB)

  // if the given polygons don't overlap at the given point, simply return them both
  if (!point || !polygonA.includes(point) || !polygonB.includes(point)) {
    return [polygonA, polygonB]
  }
  
  /*
  the algorithm marches clockwise around polygonA, starting at the last point polygonA shares with 
  polygonB. When it reaches the other side of polygonB, it starts marching around polygonB until it 
  comes back to the starting point, this way it gathers the perimeter of the combined polygon.
  All polygons are assumed to be indexed in a clockwise order around their perimeter.
  */
  i = (i + 1) % loopingShape.length
  do {
    //console.log(polygonB)

    // the starting point for the marching algorithm must be the last point that the two polygons share
    if (!started) {
      if (polygonB.includes(loopingShape[i])) {
        // this point is the next starting point
        startingPoint = loopingShape[i]
      } else {
        started = true
        newPolygon.push(startingPoint) // the starting point should be the first point in the new polygon
      }
    }
    if (started) {
      newPolygon.push(loopingShape[i])

      // if we've reached the other side of polygonB
      // the first condition confirms that we haven't already started marching around polygonB (though
      // it's not totally necessary)
      if (loopingShape !== polygonB && polygonB.includes(loopingShape[i])) {
        i = polygonB.indexOf(loopingShape[i])
        loopingShape = polygonB
      }
    }
    
    // go to the next point in the loooping shape
    i = (i + 1) % loopingShape.length

  } while (loopingShape[i] != startingPoint)

  if (polygonEquals(newPolygon, polygonA)) {
    return [polygonB, newPolygon]
  }
  if (polygonEquals(newPolygon, polygonB)) {
    return [newPolygon, polygonA]
  }

  return [newPolygon]
}

//TODO fix for polygons containing the same points but in the wrong order
/*
tests whether two polygons share all the same points, regardless of order
*/
function polygonEquals(polygonA, polygonB) {
  return !polygonA.some((point) => !polygonB.includes(point)) && !polygonB.some((point) => !polygonA.includes(point))
}

/*
checks whether polygonA is enclosed inside polygonB
*/
function polygonInside(polygonA, polygonB) {

  // tests whether every point in polygonA has a set of points in polygonB
  // that lie to either side of it
  for (i in polygonA) {
    let north = false
    let south = false
    let east = false
    let west = false
    for (j in polygonB) {
      let relation = pointRelation(polygonA[i], polygonB[j])

      if (relation == "north") {
        north = true
      }
      if (relation == "south") {
        south = true
      }
      if (relation == "east") {
        east = true
      }
      if (relation == "west") {
        west = true
      }
      if (relation == "equal") {
        north = true
        south = true
        east = true
        west = true
      }
    }
    if (!north || !south || !east || !west) return false
  }
  return true
}

/*
tests whether pointB is directly north, south, east, or west of pointA
returns undefined if none of those are true, and equal if the two points are the same
*/
function pointRelation(pointA, pointB) {
  if (pointA == pointB) return "equal"

  let arrayA = pointA.split(",").map((x) => parseInt(x))
  let arrayB = pointB.split(",").map((x) => parseInt(x))

  if (arrayA[0] == arrayB[0]) {
    if (arrayA[1] < arrayB[1]) return "south"
    else if (arrayA[1] > arrayB[1]) return "north"
  }
  else if (arrayA[1] == arrayB[1]) {
    if (arrayA[0] < arrayB[0]) return "east"
    else if (arrayA[0] > arrayB[0]) return "west"
  }
  return undefined
}

function drawSelectionPolygons(polygonList, antipolygonList) {
  dashOffset -= deltaTime*0.05
  if (dashOffset < -displayScale) dashOffset = 0

  drawingContext.setLineDash([displayScale / 2])
  strokeWeight(3)
  stroke(255)
  blendMode(DIFFERENCE)

  drawingContext.lineDashOffset = dashOffset
  for (i in polygonList) {
    drawPolygon(polygonList[i])
  }

  for (i in antipolygonList) {
    drawPolygon(antipolygonList[i])
  }

  blendMode(BLEND)
  drawingContext.setLineDash([])
}

function drawPolygon(polygon) {
  beginShape()
  for (let i = 0; i < polygon.length; i++) {    
    let pointX = polygon[i].split(",")[0] * patternSizeX
    let pointY = polygon[i].split(",")[1] * patternSizeY

    vertex(pointX, pointY)
  }
  endShape(CLOSE)
}
//#endregion

// History (undo and redo) system functions ------------------------------------------------------------
//#region

function doUndo() {
  if (history.length) {
    action = history.pop();
    action.undo();
    future.push(action);
  }
}

function doRedo() {
  if (future.length) {
    action = future.pop();
    action.redo();
    history.push(action);
  }
}

/* 
Log and action in the history stack.
Takes functions for when that action is undone and redone.
*/
function logAction(undo_f, redo_f) {
  let action = { undo: undo_f, redo: redo_f };
  future.length = 0;
  history.push(action);
}
//#endregion


// Direct Setters --------------------------------------------------------------------------------------
//#region 

// not used:
function setTile(value, x, y) {
  pattern_array[y][x] = value;
}

function setColor(value, key) {
  colorScheme[key] = value;
  loadColorsDiv(colorScheme, colorsDiv);
}

function setLayoutTile(value, x, y) {
  layout_array[x][y] = value;
  loadLayout();
}

function setLayout(layout_a) {
  layout_array = layout_a;
  loadLayout()
}

function setSelection(blockList) {
  selectionBlocks = blockList;
  [selectionPolygons,antiSelectionPolygons] = polygonsFromBlocks(blockList)
}
//#endregion


// Functions for loading the DOM -----------------------------------------------------------------------
//#region

/*
Load the contents of the bottom container in Draw mode 
*/
function loadDrawDiv() {
  loadCurrentColorPicker();

  fileNameInput = select("#i-file-name");
  let downloadButton = select("#b-save");
  downloadButton.mousePressed(savePattern);
  
  let loadDiv = select(".load-container")
  uploadInput = createFileInput(loadPattern);
  uploadInput.id("i-load");
  uploadInput.parent(loadDiv);
  let uploadButton = createButton("Load Pattern")
  uploadButton.id("b-load")
  uploadButton.parent(loadDiv);
  uploadButton.attribute("title", "upload pattern file");
  uploadButton.attribute("onclick", "document.getElementById('i-load').click();")

  undoButton = select("#b-undo");
  redoButton = select("#b-redo");
  undoButton.mousePressed(doUndo);
  redoButton.mousePressed(doRedo);
}

/* 
Load the buttons for changing the viewport size 
*/
function loadPlusMinusDiv() {
  let wButtonMinus = select(".width-buttons>.b-minus");
  let wButtonPlus = select(".width-buttons>.b-plus");
  let hButtonMinus = select(".height-buttons>.b-minus");
  let hButtonPlus = select(".height-buttons>.b-plus");
  wButtonMinus.mousePressed(() => changeWidth(-1));
  wButtonPlus.mousePressed(() => changeWidth(1));
  hButtonMinus.mousePressed(() => changeHeight(-1));
  hButtonPlus.mousePressed(() => changeHeight(1));
}

function loadTransformsDiv() {
  let rotateButton = select("#b-rotate");
  let expandButton = select("#b-expand");
  let contractButton = select("#b-contract");
  let fillButton = select("#b-fill");
  let reflectWButton = select("#b-flip-horizontal");
  let reflectHButton = select("#b-flip-vertical");
  let subdivideButton = select("#b-subdivide");
  let unsubdivideButton = select("#b-unsubdivide")
  let shiftRButton = select("#b-shift-right")
  let shiftDButton = select("#b-shift-down")
  rotateButton.mousePressed(patternRotate);
  expandButton.mousePressed(patternExpand);
  contractButton.mousePressed(patternContract);
  reflectWButton.mousePressed(patternFlipW);
  reflectHButton.mousePressed(patternFlipH);
  fillButton.mousePressed(patternFill);
  shiftRButton.mousePressed(patternShiftX);
  shiftDButton.mousePressed(patternShiftY);
  subdivideButton.mousePressed(patternSubdivide);
  unsubdivideButton.mousePressed(patternUnsubdivide);
}

function loadDOM() {
  loadTransformsDiv();

  loadPlusMinusDiv();

  loadDrawDiv();
}
//#endregion


// Functions for handling changing patterns ------------------------------------------------------------
//#region 

/* 
Sets the pattern to the given pattern.
Takes a pattern array, and optionally a color scheme object and a layout array.
Called when loading a new pattern from the computer and when undoing some actions.
*/
function setPattern(pattern_a, colors_o, layout_a) {
  colorScheme = colors_o || colorScheme

  if (colors_o) {
    colorsDiv = loadColorsDiv(colorScheme, colorsDiv);
    currentColors = deepCopy(colorScheme); // for history system

    let colors = Object.keys(colorScheme);
    // currentColor might be unassigned in a new session, and colorScheme might have no colors other than the default "_"
    currentColor = currentColor || colors[1] || colors[0];
  }

  pattern_array = pattern_a;

  // reset the constants storing the dimensions of the pattern for ease of use
  patternH = pattern_array.length;
  patternW = pattern_array[0].length;
  patternSizeX = squareScale * patternW;
  patternSizeY = squareScale * patternH;

  // reset the css variable to match, currently only square blocks are allowed so this only changes the width
  root.style.setProperty("--block-width", patternW);
  resetCanvas();

  // reset the graphics buffer storing the pattern block
  if (pattern_g) pattern_g.remove();
  pattern_g = createGraphics(patternSizeX, patternSizeY);

  if (layout_a) {
    layout_array = layout_a;
    loadLayout();
  }
}

/*
Load a pattern from a json file
*/
function loadPattern(file) {
  let pattern_a = file.data.pattern.split("\n").map((x) => x.split(" "));
  let layout_a;
  if (file.data.layout) layout_a = file.data.layout; // backwards compatibility with patterns that don't have layouts
  let colors_o = file.data.colorScheme;

  let previousPattern = deepCopy([pattern_array, colorScheme, layout_array]);
  let currentPattern = deepCopy([pattern_a, colors_o, layout_a]);

  setPattern(pattern_a, colors_o, layout_a);

  // set the text in the filename download to the title of the pattern that is being loaded
  if (fileNameInput) {
    let fileName = uploadInput.value()
      .slice(uploadInput.value().lastIndexOf("\\") + 1,
             uploadInput.value().indexOf(".json"));
    fileNameInput.value(fileName);
    uploadInput.value("");
  }

  // log in history
  if (previousPattern[0]) {
    logAction(
      () => setPattern(...previousPattern),
      () => setPattern(...currentPattern)
    );
  }
}

/*
Save the current pattern into the client's default download folder
*/
function savePattern() {
  let contents = {};

  // order the colorScheme so when you load the pattern back, they will be in the proper order
  let colorsOrdered = Object.keys(colorScheme).sort( // sort the keys by the order of the corresponding color pickers
    function(a, b) {
        if (a == "_") return -1
        else if (b == "_") return 1
        else return parseInt((new p5.Element(select("#" + a).parent())).style("order")) /
        - parseInt((new p5.Element(select("#" + b).parent())).style("order"))
      }
  ).reduce( // populate a new object in the order of the sorted keys
    (obj, key) => { 
      obj[key] = colorScheme[key]; 
      return obj;
    },
    {}
  );

  contents.colorScheme = colorsOrdered;
  contents.pattern = pattern_array.map((x) => x.join(" ")).join("\n");
  contents.layout = layout_array;

  let name = fileNameInput.value();
  // default name if nothing is inputted (or the input is just white space)
  if (name.trim().length == 0) name = "quilt_pattern"; 

  save(contents, name + ".json")
}

/* 
reset the canvas size to match the current pattern.
*/
function resetCanvas() {
  resizeCanvas(patternSizeX * W + margin*2, patternSizeY * H + margin*2);
}
//#endregion


// Color System Functions ------------------------------------------------------------------------------
//#region

/*
loads or reloads a colors Dom (either the main one, or the alternate colors in block mode)
takes a colors scheme object to generate color pickers from
takes a parent div to populate with color pickers
*/
function loadColorsDiv(colors_o, parentDiv) {
  // if the parentDiv exists, remove it and recreate the
  if (parentDiv) {
    parentDiv.remove();
    parentDiv = createElement("ul");
    parentDiv.class("colors-container");
    parentDiv.parent(select(".display-one"));
  } else {
    parentDiv = select(".colors-container")
  }

  // generate the pickers
  let position = 0;

  let colors = Object.keys(colors_o);
  for (var i in colors) {
    colors_o[colors[i]] = color(colors_o[colors[i]].levels);
    if (colors[i] === "_") continue;
    newPicker(colors_o[colors[i]], colors[i], position, parentDiv);
    position++;
  }
  pickerPosition = position

  return parentDiv
}

/*
creates a color picker in the DOM, given the following:
a p5.Color to start the color picker with
an id for the color picker
an order integer that determines the order to display in the dom
a p5.Element under which to generate the picker
*/
function newPicker(color, id, order, parentDiv) {
  // create the container for the picker
  let pickerDiv = createDiv();
  pickerDiv.parent(parentDiv);
  pickerDiv.class("color-picker-container");
  pickerDiv.style("order", order);

  // add a hover event listener for when dragging another picker over this one
  pickerDiv.elt.addEventListener("mouseover", function() {
    let draggingPicker = select(".color-picker-container.dragging")
    if (draggingPicker) {
      let newOrder = parseInt(pickerDiv.style("order")); // the new order of the dragging picker
      let prevOrder = draggingPicker.style("order") // the previous order of the dragging picker

      // check every other picker in the container whether their order needs to be changed (if in between newOrder and PrevOrder)
      parentDiv.child().forEach(function(picker) {
        picker = new p5.Element(picker) // .child() returns array of dom elements, so convert to p5.Elements
        let thisOrder = parseInt(picker.style("order"))
        if (prevOrder < thisOrder && thisOrder <= newOrder) {
          picker.style("order", thisOrder - 1)
        } else if (prevOrder > thisOrder && thisOrder >= newOrder) {
          picker.style("order", thisOrder + 1)
        }
      })
      draggingPicker.style("order", newOrder)
    }
  })

  // create the drag button
  let dragButton = createButton("☰")
  dragButton.parent(pickerDiv);
  dragButton.attribute("title", "drag color");
  dragButton.class("b-drag")
  dragButton.elt.addEventListener("mousedown", function() {
    pickerDiv.addClass("dragging")
  })

  // create the picker
  let picker = createColorPicker(color);
  picker.class("color-picker");
  picker.id(id);
  picker.parent(pickerDiv);
  picker.input(updateColor);
  picker.elt.addEventListener("change", logColorChange, false);
  picker.doubleClicked(setCurrentColor);
  picker.attribute("title", "color");

  // create the delete button
  let deleteButton = createButton("×");
  deleteButton.parent(pickerDiv);
  deleteButton.mousePressed(() => deleteColor(id));
  deleteButton.attribute("title", "delete color");
}

/*
add an event listener to the document so that on any mouseup,
release the dragging picker if there is one
*/
document.addEventListener("mouseup", function(event) {
  let div = select(".dragging")
  if (div) div.removeClass("dragging")

  // just in case these get stuck down
  if (!event.altKey) {
    altDown = false
  }
  if (!event.shiftKey) {
    shiftDown = false
  }
  if (!event.ctrlKey) {
    ctrlDown = false
  }
})

function loadCurrentColorPicker() {
  if (currentColorPicker) currentColorPicker.remove();
  currentColorPicker = createColorPicker(colorScheme[currentColor]);
  currentColorPicker.parent(select(".current-color-container"));
  currentColorPicker.class(currentColor);
  currentColorPicker.id("current-color-picker");
  currentColorPicker.attribute("title", "current active color");
  currentColorPicker.elt.addEventListener("change", currentColorChange, false);
}

function deleteColor(id) {
  let previousColorString = colorString(colorScheme[id]);

  delete colorScheme[id];
  let thisPicker = select("#" + id).parent();
  let order = new p5.Element(thisPicker).style("order");
  thisPicker.remove();

  let previousPattern = deepCopy(pattern_array);
  for (var i in pattern_array) {
    for (var j in pattern_array) {
      pattern_array[i][j] = pattern_array[i][j].replace(id, "_");
    }
  }
  let currentPattern = deepCopy(pattern_array);

  logAction(
    function () {
      newPicker(colorParse(previousColorString), id, order, colorsDiv);
      colorScheme[id] = colorParse(previousColorString);

      setPattern(previousPattern);
      currentColors = deepCopy(colorScheme);
    },
    function () {
      delete colorScheme[id];
      select("#" + id)
        .parent()
        .remove();

      setPattern(currentPattern);
      currentColors = deepCopy(colorScheme);
    }
  );
  currentColors = deepCopy(colorScheme);
}

function newColor(color) {
  let colors = Object.keys(colorScheme);
  for (var i in colors) {
    if (colorScheme[colors[i]].toString() === color.toString()) {
      return colors[i];
    }
  }

  let id = newColorId();
  newPicker(color, id, pickerPosition, colorsDiv);
  let order = pickerPosition;
  pickerPosition++;

  colorScheme[id] = color;

  // history system
  logAction(
    function () {
      delete colorScheme[id];
      select("#" + id)
        .parent()
        .remove();
      currentColors = deepCopy(colorScheme);
    },
    function () {
      newPicker(color, id, order, colorsDiv);
      colorScheme[id] = color;
      currentColors = deepCopy(colorScheme);
    }
  );
  currentColors = deepCopy(colorScheme);

  currentColorPicker.elt.removeEventListener("change", currentColorChange);
  let tempCallback = function () {
    currentColorPicker.elt.removeEventListener("change", tempCallback);
    currentColorPicker.elt.addEventListener("change", currentColorChange);
  };
  currentColorPicker.elt.addEventListener("change", tempCallback, false);

  currentColor = id;
  currentColorPicker.class(id);
  return id;
}

function newColorId() {
  let colors = Object.keys(colorScheme);

  for (let index = 0; true; index++) {
    let id = ""
    let i = index
    while (i >= 0) {
      id = alphabet[i % alphabet.length] + id
      i = Math.floor(i / alphabet.length) - 1
    }
    if (!colors.includes(id) && id != currentColor) {
      return id;
    }
  }
}

function updateColor() {
  colorScheme[this.id()] = this.color();

  if (currentColorPicker.class() == this.id()) {
    loadCurrentColorPicker();
  }
}

function currentColorChange() {
  currentColor = "!";
  currentColorPicker.class(currentColor);
}

function setCurrentColor() {
  currentColor = this.id();

  loadCurrentColorPicker();
}

/* 
check if the given color, or if no color is given the color stored in the current color picker, is already a color
in the colorScheme, otherwise add it to the colorScheme.
called whenever a change is made to the pattern using the current color.
*/
function checkForNewColor(color) {
  if (color) {
    let colors = Object.keys(colorScheme)
    for (i in colors) {
      if (colorString(color) != colorString(colorScheme[colors[i]])) {
        currentColor = newColor(color);
      }
    }
  } else if (
    !colorScheme[currentColor] ||
    currentColorPicker.color().toString() !==
      colorScheme[currentColor].toString()
  ) {
    currentColor = newColor(currentColorPicker.color());
  }
}

/* 
When a colorpicker is changed, this function logs that change in the history stack.
It is called when a color-picker in the color scheme registers a "change" event
*/
function logColorChange(event) {
  let id = new p5.Element(event.target).id();

  if (currentColors) {
    let previousString = colorString(currentColors[id]);
    let currentString = colorString(colorScheme[id]);

    logAction(
      function () {
        setColor(colorParse(previousString), id);
        currentColors = deepCopy(colorScheme);
      },
      function () {
        setColor(colorParse(currentString), id);
        currentColors = deepCopy(colorScheme);
      }
    );
  }
  currentColors = deepCopy(colorScheme);

  let colors = Object.keys(colorScheme)
  for (i in colors) { 
    if (id != colors[i] && colorString(colorScheme[colors[i]]) == colorString(colorScheme[id])) {
      let previousPattern = deepCopy(pattern_array)
      pattern_array = pattern_array.map((x) => x.map((y) => y.replace(id,colors[i])))
      let currentPattern = deepCopy(pattern_array)
      let previousColorString = colorString(colorScheme[id])
      let order = parseInt(new p5.Element(select("#" + id).parent()).style("order"))

      delete colorScheme[id];
      select("#" + id)
        .parent()
        .remove();
        
      logAction(
        function () {
          newPicker(colorParse(previousColorString), id, order, colorsDiv);
          colorScheme[id] = colorParse(previousColorString);
    
          setPattern(previousPattern);
          currentColors = deepCopy(colorScheme);
        },
        function () {
          delete colorScheme[id];
          select("#" + id)
            .parent()
            .remove();
    
          setPattern(currentPattern);
          currentColors = deepCopy(colorScheme);
        }
      );
    }
  }
}
//#endregion


// Layout System Functions -----------------------------------------

function loadLayout() {
  if (layoutDiv) {
    layoutDiv.remove();
    layoutDiv = createSpan();
    layoutDiv.class("layout-container");
    layoutDiv.parent(select(".display-two"));
  } else {
    layoutDiv = select(".layout-container");
  }

  let transforms = Object.keys(LayoutTransforms);

  for (var i = 0; i < layout_array.length; i++) {
    let row = createDiv();
    row.parent(layoutDiv);
    row.class("layout-row");

    for (var j = 0; j < layout_array[0].length; j++) {
      let button = createButton(
        loadFile("Icons/" + transforms[layout_array[i][j]] + ".svg")
      );
      button.parent(row);
      button.class("layout-button");

      if (i == 0 && j == 0) {
        button.id("template");
        button.attribute("title", "template");
      } else {
        let n = i;
        let m = j;
        button.mousePressed(() => next(n, m));
      }

      switch (layout_array[i][j]) {
        case 0:
          if (i != 0 || j != 0) button.attribute("title", "none");
          break;
        case 1:
          button.attribute("title", "rotate 90°");
          break;
        case 2:
          button.attribute("title", "rotate 180°");
          break;
        case 3:
          button.attribute("title", "rotate 270°");
          break;
        case 4:
          button.attribute("title", "flip horizontal");
          break;
        case 5:
          button.attribute("title", "flip vertical");
          break;
        case 6:
          button.attribute("title", "flip diagonal northwest");
          break;
        case 7:
          button.attribute("title", "flip diagonal northeast");
          break;
      }

      let svg = new p5.Element(button.child()[0]);
      if (layout_array[i][j] == 0) {
        svg.style("width", displayScale * 0.8 + "px");
        svg.style("height", displayScale * 0.8 + "px");
      } else if (layout_array[i][j] <= 3) {
        svg.style("width", displayScale * 1.6 + "px");
        svg.style("height", displayScale * 1.6 + "px");
      } else if (layout_array[i][j] <= 5) {
        svg.style("width", displayScale * 1.2 + "px");
        svg.style("height", displayScale * 1.2 + "px");
      } else {
        svg.style("width", displayScale * 1.1 + "px");
        svg.style("height", displayScale * 1.1 + "px");
      }
    }
    if (i == 0) {
      let wButtonDiv = createDiv();
      wButtonDiv.parent(row);
      wButtonDiv.class("layout-wh-container width");
      createPlusMinusButton(true, wButtonDiv, -1);
      createPlusMinusButton(true, wButtonDiv, 1);
    }
  }

  let hButtonDiv = createDiv();
  hButtonDiv.parent(layoutDiv);
  hButtonDiv.class("layout-wh-container height");
  createPlusMinusButton(false, hButtonDiv, -1);
  createPlusMinusButton(false, hButtonDiv, 1);
}

function createPlusMinusButton(horizontal, parent, value) {
  let button;
  if (value > 0) {
    button = createButton("+");
    button.attribute("title", "extend layout");
  } else if (value < 0) {
    button = createButton("-");
    button.attribute("title", "shorten layout");
  }
  button.parent(parent);
  button.class("layout-wh-button");

  if (horizontal) {
    button.mousePressed(() => changeLayoutWidth(value));
  } else {
    button.mousePressed(() => changeLayoutHeight(value));
  }
}

function changeLayoutWidth(value) {
  let oldLayout = deepCopy(layout_array)

  if (value > 0) layout_array.forEach((x) => x.push(0));
  else if (layout_array[0].length > 1) layout_array.forEach((x) => x.pop());

  let newLayout = deepCopy(layout_array)

  loadLayout();

  logAction (() => setLayout(oldLayout), () => setLayout(newLayout))
}

function changeLayoutHeight(value) {
  let oldLayout = deepCopy(layout_array)
  
  if (value > 0)
    layout_array.push(Array.from({ length: layout_array[0].length }, () => 0));
  else if (layout_array.length > 1) layout_array.pop();

  let newLayout = deepCopy(layout_array)

  loadLayout();

  logAction (() => setLayout(oldLayout), () => setLayout(newLayout))
}

function next(x, y) {
  let previous = layout_array[x][y];
  let current = (previous + 1) % Object.keys(LayoutTransforms).length;
  layout_array[x][y] = current;

  loadLayout();

  logAction(
    () => setLayoutTile(previous, x, y),
    () => setLayoutTile(current, x, y)
  );
}


// Transformations/Tool Bar functions ----------------------------

function patternRotate() {
  let previousArray = pattern_array;
  let newArray = [];

  for (var j = 0; j < patternW; j++) {
    newArray.push([]);
    for (var i = 0; i < patternH; i++) {
      let newTile = pattern_array[patternH - 1 - i][j];
      if (newTile.includes("/"))
        newTile = newTile.replace(/([A-Z]+|_)\/([A-Z]+|_)/, "$2\\$1");
      else if (newTile.includes("\\"))
        newTile = newTile.replace(/([A-Z]+|_)\\([A-Z]+|_)/, "$1/$2");

      newArray[j].push(newTile);
    }
  }

  pattern_array = newArray;

  logAction(
    () => setPattern(previousArray),
    () => setPattern(newArray)
  );
}

function patternExpand() {
  let previousPattern = deepCopy(pattern_array);

  patternW += 1;
  patternH += 1;

  root.style.setProperty("--block-width", patternW);

  pattern_array.forEach(function (x) {
    x.push("-_-");
  });
  pattern_array.push(Array.from({ length: patternW }, () => "-_-"));

  patternSizeX = patternW * squareScale;
  patternSizeY = patternH * squareScale;

  pattern_g.remove();
  pattern_g = createGraphics(patternSizeX, patternSizeY);

  resetCanvas();

  let currentPattern = deepCopy(pattern_array);

  logAction(
    () => setPattern(previousPattern),
    () => setPattern(currentPattern)
  );
}

function patternContract() {
  if (patternW == 1 || patternH == 1) return;

  let previousPattern = deepCopy(pattern_array);

  patternW -= 1;
  patternH -= 1;

  root.style.setProperty("--block-width", patternW);

  pattern_array.pop();
  pattern_array.forEach(function (x) {
    x.pop();
  });

  patternSizeX = patternW * squareScale;
  patternSizeY = patternH * squareScale;

  pattern_g.remove();
  pattern_g = createGraphics(patternSizeX, patternSizeY);

  resetCanvas();

  let currentPattern = deepCopy(pattern_array);

  logAction(
    () => setPattern(previousPattern),
    () => setPattern(currentPattern)
  );
}

function patternFlipW() {
  let previousArray = deepCopy(pattern_array);
  pattern_array = pattern_array.map((x) => x.reverse());

  for (let i = 0; i < patternH; i++) {
    for (let j = 0; j < patternW; j++) {
      let newTile = pattern_array[i][j];

      if (newTile.includes("/"))
        newTile = newTile.replace(/([A-Z]+|_)\/([A-Z]+|_)/, "$2\\$1");
      else if (newTile.includes("\\"))
        newTile = newTile.replace(/([A-Z]+|_)\\([A-Z]+|_)/, "$2/$1");

      pattern_array[i][j] = newTile;
    }
  }

  let newArray = deepCopy(pattern_array);

  logAction(
    () => setPattern(previousArray),
    () => setPattern(newArray)
  );
}

function patternFlipH() {
  let previousArray = deepCopy(pattern_array);
  pattern_array = pattern_array.reverse();

  for (let i = 0; i < patternH; i++) {
    for (let j = 0; j < patternW; j++) {
      let newTile = pattern_array[i][j];

      if (newTile.includes("/"))
        newTile = newTile.replace(/([A-Z]+|_)\/([A-Z]+|_)/, "$1\\$2");
      else if (newTile.includes("\\"))
        newTile = newTile.replace(/([A-Z]+|_)\\([A-Z]+|_)/, "$1/$2");

      pattern_array[i][j] = newTile;
    }
  }

  let newArray = deepCopy(pattern_array);

  logAction(
    () => setPattern(previousArray),
    () => setPattern(newArray)
  );
}

function patternFill() {
  let previousArray = deepCopy(pattern_array);

  checkForNewColor();

  if (pattern_array.map((x) => x.join()).join().includes("_")) {
    pattern_array = pattern_array.map((x) =>
      x.map((y) => 
      y.replaceAll("_",currentColor).replace(`${currentColor}\/${currentColor}`, `-${currentColor}-`).replace(`${currentColor}\\${currentColor}`, `-${currentColor}-`)))
  } else {
    pattern_array = pattern_array.map((x) =>
      x.map((y) => "-" + currentColor + "-")
    );
  }
  
  let newArray = deepCopy(pattern_array);

  if (JSON.stringify(previousArray) != JSON.stringify(newArray)) {
    logAction(
      () => setPattern(previousArray),
      () => setPattern(newArray)
    );
  }
}

function patternShiftX() {
  let previousArray = deepCopy(pattern_array);

  for (i in pattern_array) {
    pattern_array[i].unshift(pattern_array[i].pop())
  }

  let newArray = deepCopy(pattern_array);

  if (JSON.stringify(previousArray) != JSON.stringify(newArray)) {
    logAction(
      () => setPattern(previousArray),
      () => setPattern(newArray)
    );
  }
}

function patternShiftY() {
  let previousArray = deepCopy(pattern_array);

  pattern_array.unshift(pattern_array.pop())

  let newArray = deepCopy(pattern_array);

  if (JSON.stringify(previousArray) != JSON.stringify(newArray)) {
    logAction(
      () => setPattern(previousArray),
      () => setPattern(newArray)
    );
  }
}

function patternSubdivide() {
  let previousArray = deepCopy(pattern_array);
  let newArray = []

  for (var i in pattern_array) {
    let rowOne = []
    let rowTwo = []
    
    for (var j in pattern_array[i]) {
      let S = pattern_array[i][j]
      
      tile = S.match(/-([A-Z]+|_)-/);
      if (tile) {
        rowOne.push(S)
        rowOne.push(S)
        rowTwo.push(S)
        rowTwo.push(S)
      }
      tile = S.match(/([A-Z]+|_)\/([A-Z]+|_)/);
      if (tile) {
        rowOne.push("-" + tile[1] + "-")
        rowOne.push(S)
        rowTwo.push(S)
        rowTwo.push("-" + tile[2] + "-")
      }
      tile = S.match(/([A-Z]+|_)\\([A-Z]+|_)/);
      if (tile) {
        rowOne.push(S)
        rowOne.push("-" + tile[2] + "-")
        rowTwo.push("-" + tile[1] + "-")
        rowTwo.push(S)
      }
    }
    
    newArray.push(rowOne)
    newArray.push(rowTwo)
  }
  
  squareScale /= 2
  root.style.setProperty("--square-scale", squareScale + "px")
  setPattern(deepCopy(newArray))
  
  logAction(function() {
    squareScale *= 2
    root.style.setProperty("--square-scale", squareScale + "px")
    setPattern(previousArray)
  }, function() {
    squareScale /= 2
    root.style.setProperty("--square-scale", squareScale + "px")
    setPattern(newArray)
  })
}

//TODO remove unused colors
function patternUnsubdivide() {
  let previousArray = deepCopy(pattern_array);
  let newArray = []

  for (var i = 0; i < pattern_array.length; i += 2) {
    if (i + 1 >= pattern_array.length) continue
    newArray.push([])
    for (var j = 0; j < pattern_array[i].length; j += 2) {
      let newTile;
      let fullVariance;
      let rDiagonalVariance;
      let lDiagonalVariance;

      if (j + 1 >= pattern_array[i].length) continue

      let tiles = [
        pattern_array[i][j],
        pattern_array[i][j + 1],
        pattern_array[i + 1][j],
        pattern_array[i + 1][j + 1]
      ]
      
      let colors = []
      let colorsNW = []
      let colorsSE = []
      let colorsNE = []
      let colorsSW = []
      
      for (let k = 0; k < tiles.length; k++) {
        tile = tiles[k].match(/-([A-Z]+|_)-/);
        if (tile) {
          let color = colorScheme[tile[1]]
          colors.push(color,color,color,color);
          switch (k) {
            case 0:
              colorsNW.push(color,color,color,color);
              colorsNE.push(color,color);
              colorsSW.push(color,color);
              break;
            case 1:
              colorsNE.push(color,color,color,color);
              colorsNW.push(color,color);
              colorsSE.push(color,color);
              break;
            case 2:
              colorsSW.push(color,color,color,color);
              colorsNW.push(color,color);
              colorsSE.push(color,color);
              break;
            case 3:
              colorsSE.push(color,color,color,color);
              colorsNE.push(color,color);
              colorsSW.push(color,color);
              break;
          }
        }
        tile = tiles[k].match(/([A-Z]+|_)\/([A-Z]+|_)/);
        if (tile) {
          let colorA = colorScheme[tile[1]]
          let colorB = colorScheme[tile[2]]
          colors.push(colorA,colorA,colorB,colorB);
          switch (k) {
            case 0:
              colorsNW.push(colorA,colorA,colorB,colorB);
              colorsNE.push(colorA,colorB);
              colorsSW.push(colorA,colorB);
              break;
            case 1:
              colorsNE.push(colorA,colorA,colorB,colorB);
              colorsNW.push(colorA,colorA);
              colorsSE.push(colorB,colorB);
              break;
            case 2:
              colorsSW.push(colorA,colorA,colorB,colorB);
              colorsNW.push(colorA,colorA);
              colorsSE.push(colorB,colorB);
              break;
            case 3:
              colorsSE.push(colorA,colorA,colorB,colorB);
              colorsNE.push(colorA,colorB);
              colorsSW.push(colorA,colorB);
              break;
          }
        }
        tile = tiles[k].match(/([A-Z]+|_)\\([A-Z]+|_)/);
        if (tile) {
          let colorA = colorScheme[tile[1]]
          let colorB = colorScheme[tile[2]]
          colors.push(colorA,colorA,colorB,colorB);
          switch (k) {
            case 0:
              colorsNW.push(colorA,colorA,colorB,colorB);
              colorsNE.push(colorB,colorB);
              colorsSW.push(colorA,colorA);
              break;
            case 1:
              colorsNE.push(colorA,colorA,colorB,colorB);
              colorsNW.push(colorA,colorB);
              colorsSE.push(colorA,colorB);
              break;
            case 2:
              colorsSW.push(colorA,colorA,colorB,colorB);
              colorsNW.push(colorA,colorB);
              colorsSE.push(colorA,colorB);
              break;
            case 3:
              colorsSE.push(colorA,colorA,colorB,colorB);
              colorsNE.push(colorB,colorB);
              colorsSW.push(colorA,colorA);
              break;
          }
        }
      }
      
      let digits = 8
      fullVariance = variance(...colors).toFixed(digits)
      rDiagonalVariance = ((variance(...colorsNW) + variance(...colorsSE)) / 2).toFixed(digits)
      lDiagonalVariance = ((variance(...colorsNE) + variance(...colorsSW)) / 2).toFixed(digits)

      if (fullVariance <= rDiagonalVariance && fullVariance <= lDiagonalVariance) {
        checkForNewColor(pickNewColor(...colors))
        newTile = "-" + currentColor + "-"
      } else if (rDiagonalVariance <= lDiagonalVariance && rDiagonalVariance <= fullVariance) {
        checkForNewColor(pickNewColor(...colorsNW))
        let colorA = currentColor
        checkForNewColor(pickNewColor(...colorsSE))
        let colorB = currentColor
        newTile = colorA + "\/" + colorB
      } else if (lDiagonalVariance <= rDiagonalVariance && lDiagonalVariance <= fullVariance) {
        checkForNewColor(pickNewColor(...colorsSW))
        let colorA = currentColor
        checkForNewColor(pickNewColor(...colorsNE))
        let colorB = currentColor
        newTile = colorA + "\\" + colorB
      }
    
      newArray[i/2].push(newTile)
      newArray = newArray.map((x) =>
        x.map((y) => 
        y.replace(`${currentColor}\/${currentColor}`, `-${currentColor}-`)
        .replace(`${currentColor}\\${currentColor}`, `-${currentColor}-`)))
    }
  }

  //console.log(newArray)
  
  squareScale *= 2
  root.style.setProperty("--square-scale", squareScale + "px")
  setPattern(deepCopy(newArray))
  
  logAction(function() {
    squareScale /= 2
    root.style.setProperty("--square-scale", squareScale + "px")
    setPattern(previousArray)
  }, function() {
    squareScale /= 2
    root.style.setProperty("--square-scale", squareScale + "px")
    setPattern(newArray)
  })
}

// helper functions for unsubdivide
function pickNewColor(...colorSet) {
  let threshold = 200
  let avg = avgColor(...colorSet)
  let colorIds = Object.keys(colorScheme)
  for (i in colorIds) {
    if (variance(avg, colorScheme[colorIds[i]]) < threshold) return colorScheme[colorIds[i]] 
  }
  return avg
}

function variance(...colorSet) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (let i = 0; i < colorSet.length; i++) {
    r += Math.pow(red(colorSet[i]),  2)
    g += Math.pow(green(colorSet[i]),2) 
    b += Math.pow(blue(colorSet[i]), 2)
  }
  let rAvg = Math.sqrt(r / colorSet.length)
  let gAvg = Math.sqrt(g / colorSet.length)
  let bAvg = Math.sqrt(b / colorSet.length)
  let rVar = 0
  let gVar = 0
  let bVar = 0
  for (let i = 0; i < colorSet.length; i++) {
    rVar += Math.pow(red(colorSet[i]) - rAvg,  2)
    gVar += Math.pow(green(colorSet[i]) - gAvg,2)
    bVar += Math.pow(blue(colorSet[i]) - bAvg, 2)
  }
  rVar /= colorSet.length
  gVar /= colorSet.length
  bVar /= colorSet.length

  return (rVar + gVar + bVar)/3
}

function avgColor(...colorSet) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (i in colorSet) {
    r += Math.pow(red(colorSet[i]),  2)
    g += Math.pow(green(colorSet[i]),2) 
    b += Math.pow(blue(colorSet[i]), 2)
  }
  let rAvg = Math.sqrt(r / colorSet.length)
  let gAvg = Math.sqrt(g / colorSet.length)
  let bAvg = Math.sqrt(b / colorSet.length)
  return color(rAvg, gAvg, bAvg)
}


// Plus and Minus Buttons ---------------------------------------------

function changeWidth(amount) {
  if (W > 1 || amount >= 0) {
    W += amount;
    root.style.setProperty("--pattern-w", W);
    resetCanvas();
  }
}

function changeHeight(amount) {
  if (H > 1 || amount >= 0) {
    H += amount;
    root.style.setProperty("--pattern-h", H);
    resetCanvas();
  }
}


// Utility Functions -------------------------------------------------------------------

function setup() {
  squareScale = 20;
  W = 4;
  H = 4;
  mouseTimer = 0;

  history = [];
  future = [];

  angleMode(DEGREES);

  root = document.documentElement;
  root.style.setProperty("--square-scale", squareScale + "px");
  root.style.setProperty("--pattern-w", W);
  root.style.setProperty("--pattern-h", H);
  displayScale = parseInt(
    new p5.Element(root).style("--display-scale").split("px")[0]
  );

  loadPattern({
    data: JSON.parse(loadFile("Basic Patterns/Jacob's Ladder.json")),
  });

  loadDOM();

  margin = parseInt(new p5.Element(root).style("--display-scale").split("px")[0]) * 0.25
  let canvas = createCanvas(patternSizeX * W + margin*2, patternSizeY * H + margin*2);
  canvas.parent(select(".canvas-container"));
  canvas.mousePressed(canvasMousePressed);

  loadLayout();

  test();

  [selectionPolygons, antiSelectionPolygons] = polygonsFromBlocks(selectionBlocks)
}

function draw() {
  background(255)
  // draw the quilt with padding before the edge of the canvas so strokes won't be cut off.
  translate(margin, margin)
  mousePatternX = mouseX - margin
  mousePatternY = mouseY - margin
  
  pattern_g.background("white");
  printPattern(pattern_array, pattern_g);

  if (mouseOverCanvas) {
    continueDraw()
    updateSelect()
  }

  //print the cursor
  if (mouseOverCanvas() && currentMode == Modes.draw) {
    drawTriCursor(currentTileDouble(), pattern_g);
  }

  printQuilt(pattern_g, W, H);
  stroke(0);
  strokeWeight(3);
  noFill();
  rect(0, 0, patternSizeX, patternSizeY);

  noStroke();

  drawSelectionPolygons(selectionPolygons, antiSelectionPolygons)

  if (mouseOverCanvas() && currentMode == Modes.block) {
    //drawBlockCursor()
  }
  
  drawBlockCursor()
}

function deepCopy(object) {
  return JSON.parse(JSON.stringify(object));
}

function colorString(color) {
  return JSON.stringify(color.levels);
}

function colorParse(string) {
  return color(...JSON.parse(string));
}

document.addEventListener("keydown", (event) => {
  if (event.ctrlKey && event.key === "Z") {
    doRedo();
  } else if (event.ctrlKey && event.key === "z") {
    doUndo();
  } else if (event.ctrlKey && event.key === "A") {
    let previousSelection = deepCopy(selectionBlocks)
    selectionBlocks = []
    selectionPolygons = []
    logAction(() => setSelection(previousSelection), () => setSelection([]))
  }
  if (event.ctrlKey) {
    ctrlDown = true
  }
  if (event.shiftKey) {
    shiftDown = true
  }
  if (event.altKey) {
    altDown = true
  }
});

document.addEventListener("keyup", (event) => {
  if (event.key == "Ctrl") {
    ctrlDown = falses
  }
  if (event.key == "Shift") {
    shiftDown = false
  }
  if (event.key == "Alt") { // fixes altkey not registering up (something to do with alt deselecting the window?)
    altDown = false
  }
})

function mouseReleased() {
  switch (currentMode) {
    case Modes.draw:
      releaseDraw()
      break
    case Modes.block:
      releaseSelect()
      break
  }
}

function canvasMousePressed() {
  if (mouseOverCanvas()) {
    switch (currentMode) {
      case Modes.draw:
        beginDraw()
        break
      case Modes.block:
        beginSelect()
        break
    }
  }
}

function mouseOverCanvas() {
  return (
    0 <= mousePatternX &&
    mousePatternX < patternSizeX * W &&
    0 <= mousePatternY &&
    mousePatternY < patternSizeY * H
  );
}

/* 
Synchronously read a text file from the web server with Ajax

The filePath is relative to the web page folder.
Example:   myStuff = loadFile("Chuuk_data.txt");

You can also pass a full URL, like http://sealevel.info/Chuuk1_data.json, but there
might be Access-Control-Allow-Origin issues. I found it works okay in Firefox, Edge,
or Opera, and works in IE 11 if the server is configured properly, but in Chrome it only
works if the domains exactly match (and note that "xyz.com" & "www.xyz.com" don't match).
Otherwise Chrome reports an error:

No 'Access-Control-Allow-Origin' header is present on the requested resource. Origin 'http://sealevel.info' is therefore not allowed access.

That happens even when "Access-Control-Allow-Origin *" is configured in .htaccess,
and even though I verified the headers returned (you can use a header-checker site like
http://www.webconfs.com/http-header-check.php to check it). I think it's a Chrome bug.
*/
function loadFile(filePath) {
  var result = null;
  var xmlhttp = new XMLHttpRequest();
  xmlhttp.open("GET", filePath, false);
  xmlhttp.send();
  if (xmlhttp.status == 200) {
    result = xmlhttp.responseText;
  }
  return result;
}

function test() {
}

function arrayToString2D(array) {
  let string = ""

  array.forEach((x) => string += x.toString() + "\n")

  return string
}

/* 
window.onbeforeunload = function() {
  return "Data will be lost if you leave the page, are you sure?";
};*/