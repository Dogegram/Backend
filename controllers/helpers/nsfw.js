//thanks to https://github.com/vladmandic/nudenet

const fs = require('fs');
const tf = require('@tensorflow/tfjs-node');

const options = { // options
  debug: true,
  modelPath: 'file://./tfjs_nsfw_model/model.json',
  minScore: 0.30,
  maxResults: 30,
  iouThreshold: 0.5,
  outputNodes: ['output1', 'output2', 'output3'],
};
var model;

(async () => {
  model = await tf.loadGraphModel(options.modelPath);
})();

const composite = { // composite definitions of what is a person, sexy, nude
  person: [6, 7],
  sexy: [1, 2, 3, 4, 5, 8, 9, 10, 15],
  nude: [0, 11, 12, 13],
};

const labels = [ // class labels
  'exposed anus',
  'exposed armpits',
  'belly',
  'exposed belly',
  'buttocks',
  'exposed buttocks',
  'female face',
  'male face',
  'feet',
  'exposed feet',
  'breast',
  'exposed breast',
  'vagina',
  'exposed vagina',
  'male breast',
  'exposed male breast',
];

// read image file and prepare tensor for further processing
function getTensorFromImage(imageFile) {
  const bufferT = tf.node.decodeImage(imageFile, 3);
  const expandedT = tf.expandDims(bufferT, 0);
  const imageT = tf.cast(expandedT, 'float32');
  imageT['file'] = imageFile;
  tf.dispose([expandedT, bufferT]);
  return imageT;
}

// parse prediction data
async function processPrediction(boxesTensor, scoresTensor, classesTensor, inputTensor) {
  const boxes = await boxesTensor.array();
  const scores = await scoresTensor.data();
  const classes = await classesTensor.data();
  const nmsT = await tf.image.nonMaxSuppressionAsync(boxes[0], scores, options.maxResults, options.iouThreshold, options.minScore); // sort & filter results
  const nms = await nmsT.data();
  tf.dispose(nmsT);
  const parts = [];
  for (const i in nms) { // create body parts object
    const id = parseInt(i);
    parts.push({
      score: scores[i],
      id: classes[id],
/*      class: labels[classes[id]], // lookup classes
      box: [ // convert box from x0,y0,x1,y1 to x,y,width,heigh
        Math.trunc(boxes[0][id][0]),
        Math.trunc(boxes[0][id][1]),
        Math.trunc((boxes[0][id][3] - boxes[0][id][1])),
        Math.trunc((boxes[0][id][2] - boxes[0][id][0])),
      ],*/
    });
  }
  const result = {
    nude: parts.filter((a) => composite.nude.includes(a.id)).length > 0,
  };
  return result;
}

// load graph model and run inference
async function runDetection(input) {
  const t = {};
  if (!model) { // load model if not already loaded
    try {
      model = await tf.loadGraphModel(options.modelPath);
    } catch (err) {
      throw new Error('Could not load NSFW model');
    }
  }
  t.input = getTensorFromImage(input); // get tensor from image
  [t.boxes, t.scores, t.classes] = await model.executeAsync(t.input, options.outputNodes); // run prediction
  const res = await processPrediction(t.boxes, t.scores, t.classes, t.input); // parse outputs
  Object.keys(t).forEach((tensor) => tf.dispose(t[tensor])); // free up memory
  return res;
}

// main function
module.exports.nsfw_classify = async (input)=>{
  await tf.enableProdMode();
  await tf.ready();
  var res = await runDetection(input);
  return res;
}
