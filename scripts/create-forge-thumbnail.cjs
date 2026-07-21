const sharp = require("../frontend/node_modules/sharp");

const [source, target] = process.argv.slice(2);
if (!source || !target) process.exit(2);

sharp(source)
  .rotate()
  .resize(640, 420, { fit: "inside", withoutEnlargement: true })
  .webp({ quality: 76 })
  .toFile(target)
  .catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exit(1);
  });
