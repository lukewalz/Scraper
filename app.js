import https from "https";
import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import cliProgress from "cli-progress";

const hostname = "127.0.0.1";
const port = 3000;

const ncaaSports = [
  "mens-cross-country",
  "womens-cross-country",
  "field-hockey",
  "football",
  "mens-soccer",
  "womens-soccer",
  "womens-volleyball",
  "mens-water-polo",
  "mens-basketball",
  "womens-basketball",
  "bowling",
  "fencing",
  "mens-gymnastics",
  "womens-gymnastics",
  "mens-ice-hockey",
  "womens-ice-hockey",
  "rifle",
  "skiing",
  "mens-swimming-and-diving",
  "womens-swimming-and-diving",
  "mens-track-and-field",
  "womens-track-and-field",
  "wrestling",
  "baseball",
  "womens-beach-volleyball",
  "wbvb",
  "mens-golf",
  "womens-golf",
  "mens-lacrosse",
  "womens-lacrosse",
  "rowing",
  "softball",
  "mens-tennis",
  "womens-tennis",
  "mens-volleyball",
  "womens-water-polo",
];

const MAX_REQUESTS_COUNT = 20;
const INTERVAL_MS = 10;
let PENDING_REQUESTS = 0;

// create new axios instance
const api = axios.create({
  baseURL: "https://ncaa.com",
});

axios.defaults.timeout = 3000;
axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });
axios.defaults.maxRedirects = 0;

/**
 * Axios Request Interceptor
 */
api.interceptors.request.use(function (config) {
  return new Promise((resolve, reject) => {
    let interval = setInterval(() => {
      if (PENDING_REQUESTS < MAX_REQUESTS_COUNT) {
        PENDING_REQUESTS++;
        clearInterval(interval);
        resolve(config);
      }
    }, INTERVAL_MS);
  });
});

/**
 * Axios Response Interceptor
 */
api.interceptors.response.use(
  function (response) {
    PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
    return Promise.resolve(response);
  },
  function (error) {
    PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
  }
);

const server = https.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain");
});

server.listen(port, hostname, async () => {
  console.log(`Server running at http://${hostname}:${port}/`);

  let ncaaPaths = [];
  try {
    const path = "./data/ncaaUrls.json";
    if (fs.existsSync(path)) {
      ncaaPaths = await convertOutputToArray(path);
    } else {
      // Gets all urls of ncaa university teams on ncaa domain
      const response = await getTeams();
      // writeToJson(response, "ncaaUrls.json");
      ncaaPaths = response;
    }
  } catch (er) {}

  let settled = [];
  try {
    const path = "./data/sites.json";
    if (fs.existsSync(path)) {
      settled = await convertOutputToArray(path);
    } else {
      settled = await axios
        .all(ncaaPaths.map((url) => api.get(url)))
        .then(
          axios.spread((...responses) => {
            const urls = responses.map((resp) => {
              if (resp && resp.data) {
                const $ = cheerio.load(resp.data);
                const team = $(".info").text();
                const splitTeam = team.split("@");
                if (splitTeam[0]) {
                  if (splitTeam[0].startsWith("http")) {
                    return { url: splitTeam[0], name: resp.request.path };
                  } else {
                    return {
                      url: `https://${splitTeam[0]}`,
                      name: resp.request.path,
                    };
                  }
                }
              }
            });
            return urls;
          })
        )
        .catch((er) => console.log(er.message));
    }
  } catch (err) {}

  let validUrls = [];

  try {
    const roster = await getRoster(settled);
  } catch (er) {
    console.log(er);
  }
});

const getTeams = async () => {
  const url = "https://www.ncaa.com/schools-index";

  let list = [];

  for (let index = 1; index < 2; index++) {
    try {
      const response = await axios.get(`${url}/${index}`);
      const $ = cheerio.load(response.data);
      $("table.responsive-enabled > tbody > tr > td > a").each(function (
        index,
        element
      ) {
        list.push($(element).attr("href"));
      });
    } catch (er) {
      console.log(er.message);
    }
  }

  return list;
};

const writeToJson = (school) => {
  var filtered = school.paths.filter(function (el) {
    return el != null;
  });

  let filename;
  const badList = filtered.filter((e) => e.url);
  const goodList = filtered.filter((e) => !e.url);

  if (badList.length === 0 || badList.length > 30) {
    filename = `./${school.name}.REVIEW.json`;
  } else {
    filename = `./${school.name}.json`;
  }
  fs.writeFile(
    filename,
    JSON.stringify(
      {
        school: school.name,
        base: school.base,
        goodList,
        badList,
      },
      null,
      2
    ),
    function (err) {
      if (err) {
        return console.log(err);
      }
    }
  );
};

const getRoster = async (teamObject) => {
  const urlsToLoop = teamObject.map((url, index) => {
    if (url) {
      const sportUrls = {
        base: url.url,
        paths: ncaaSports.map((sport) => `${url.url}/sports/${sport}/roster`),
        schoolName: url.name,
      };
      return sportUrls;
    }
    return;
  });

  urlsToLoop.map(async (group) => {
    if (group) {
      const y = {
        base: group.base,
        name: group.schoolName,
        paths: await axios.all(
          group.paths.map(
            async (u) =>
              await axios
                .get(u)
                .then((res) => res.status === 200 && u)
                .catch((err) => {
                  if (!err.response) {
                    return { url: u, reason: err.code };
                  } else {
                    return {
                      url: err.config.url,
                      reason: err.response.statusText,
                    };
                  }
                })
          )
        ),
      };
      writeToJson(y);
    }
  });
};

const convertOutputToArray = (path) => {
  return fs.readFileSync(path, "utf8", function (err, data) {
    return data;
  });
};
