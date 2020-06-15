const fs = require("fs").promises;
const path = require("path");

let file_path = process.argv[2];

let args = {};
let options = process.argv;
options = options.slice(3, options.length);

options.forEach(line => {
  let split = line.split("=");
  
  let key = split.splice(0, 1);
  let value = split.join("=");
  
  args[key] = value;
})

file_path = path.resolve(file_path);
let file = require(file_path) || {};

Object.keys(args).forEach(key => {
  let value = args[key];
  file[key] = value;
});

fs.writeFile(file_path, JSON.stringify(file, null, 2)).then(() => {
  console.log(`edited ${file_path}.`);
});
