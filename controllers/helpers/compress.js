const fs = require('fs');
var cuid = require('cuid');
const sharp = require('sharp')

module.exports.compress = async (buffer, quality) => {
    var compressedImage = await sharp(buffer)
        .webp({ quality: quality ? quality : 80, speed: 8 })
        .toBuffer();
    return compressedImage
}