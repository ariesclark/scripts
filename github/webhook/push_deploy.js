const execute = require('child_process').exec;
const fs = require("fs").promises;
const crypto = require("crypto");
const path = require("path");
const http = require("http");

let args = {};
process.argv.forEach(line => {
  let split = line.split("=");

  let key = split.splice(0, 1);
  let value = split.join("=");

  if (value === "") value = true;
  args[key] = value;
});

if (args.path) args.path = path.resolve(args.path, ".rubybb", "push_deploy")

let options = {
  path: args.path || path.resolve(".rubybb", "push_deploy"),
};

const fix = (json, string) => {
  
  let left = "{{";
  let right = "}}";
  
  function get(json, str) {
    str = str.replace("{{", "").replace("}}", "");
    for (const s of str.split(".")) {
        json = json[s];
    }
    return json;
  }

  let left_split = string.split(left);
  left_split.forEach(str => {
    let right_split = str.split(right);
    if (right_split[0] && right_split.length >= 2) {
      let key = right_split[0];
      let replace = left + key + right;

      string = string.replace(replace, get(json, key))
    }
  })
  return string;
}

const handle = async (json, config) => {
  return new Promise(async resolve => {
    if (!json.pusher) return resolve(false);
    
    console.log(`new push from ${json.pusher.name} (${json.pusher.email}).`);

    for (let i = 0; i < config.tasks.length; i++) {
        let task = fix(json, config.tasks[i]);
        console.log(`task #${i}: ${task}`);
        await new Promise (r => {
            execute(task, (error, output) => {
                if (error) return r();
                console.log(`task #${i}: ${output}`);
                r();
            });
        });

    }
    
    resolve(true);
  });
};

const create_config = async () => {
  return new Promise(async resolve => {
    let config = {
      key: crypto.randomBytes(64).toString("base64"),
      port: 3000,
      tasks: [
        `curl https://google.com`
      ]
    };

    await fs.mkdir(options.path, { recursive: true });
    await fs.writeFile(
      path.resolve(options.path, "config"),
      JSON.stringify(config, null, 2)
    );

    console.log(
      `generated default config to "${path.resolve(options.path, "config")}".`
    );

    resolve();
  });
};

let count = 1;
const obtain_config = async () => {
  return new Promise(async resolve => {
    console.log(
      `attempting to obtain config file from "${
        options.path
      }". (try #${count++})`
    );

    fs.readFile(path.resolve(options.path, "config"), "utf8")
      .then(content => {
        console.log(`successfully found and opened config.`);
        let config = JSON.parse(content);
      
        resolve(config);
      })
      .catch(async error => {
        await create_config();
        resolve(obtain_config());
      });
  });
};

const error = async (message, {request, response} = opt) => {
  return new Promise (resolve => {
    response.writeHead(400, { "Content-Type": "application/json" });
    resolve(response.end(`{"message": "${message}", "error": true}`));
  })
}

obtain_config().then(async config => {

  http.createServer(async (request, response) => {
    
    if (request.method !== "POST" || !request.url.includes(config.key)) {
      return await error("malformed request", {request, response});
    }
    
    let body = [];
    request.on("data", chunk => {
      body.push(chunk.toString("utf8"));
    });
    
    request.on("error", async () => {
      return await error("request failed", {request, response});
    })
    
    request.on("end", async () => {
      
      try { body = JSON.parse(body.join()); } catch (err) {
        return await error("invalid body", {request, response});
      }

      handle(body, config).then(async success => {
        if (!success) return await error("wrongfully handled", {request, response});

        response.writeHead(200, { "Content-Type": "application/json" });
        response.end(JSON.stringify({message: "ok"}));
      });
    });
    
  }).listen(3000);
  
  console.log(`opened web server on port ${config.port}.`);
  console.log(`likely available via:
    webhook url: 
        localhost:${config.port}/${config.key}
`)
});
