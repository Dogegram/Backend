const tf = require('@tensorflow/tfjs-node');
const toxicity = require('@tensorflow-models/toxicity')
const { nsfw_classify } = require('./nsfw')
var textmodel
(async () => {
    console.time('model.load')
    textmodel = await toxicity.load(0.9, ['toxicity'])
    console.timeEnd('model.load')
})()

module.exports.scanNSFW = async (buffer) => {
    return new Promise(async (resolve, reject) => {

    console.time("models.classify")
    
    const predictions = await nsfw_classify(buffer)
    console.timeEnd("models.classify")
    console.log(predictions)

    if(predictions.nude){
        resolve(true)
    } else {
        resolve(false)
    }
})
}

module.exports.checkText = async (text) => {
    const captiontoxic = await textmodel.classify(text)

    if (captiontoxic[0].results[0].match) {
        return true
    } else {
        return false
    }
}