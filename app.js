import https from "https";
import axios from "axios";
import cheerio from "cheerio";
import fs from "fs";
import cliProgress from "cli-progress";

const hostname = "127.0.0.1";
const port = 3000;

const ncaaSports = [
  "football",
  "mens-soccer",
  "womens-soccer",
  "mens-basketball",
  "womens-basketball",
  "bowling",
  "fencing",
  "gymnastics",
  "mens-gymnastics",
  "womens-gymnastics",
  "ice-hockey",
  "mens-ice-hockey",
  "womens-ice-hockey",
  "rifle",
  "skiing",
  "swimming-and-diving",
  "mens-swimming-and-diving",
  "womens-swimming-and-diving",
  "track-and-field",
  "mens-track-and-field",
  "womens-track-and-field",
  "cross-country",
  "mens-cross-country",
  "womens-cross-country",
  "xctrack",
  "outdoor-track",
  "equestrian",
  "golf",
  "mens-golf",
  "womens-golf",
  "lacrosse",
  "mens-lacrosse",
  "womens-lacrosse",
  "rowing",
  "baseball",
  "softball",
  "tennis",
  "mens-tennis",
  "womens-tennis",
  "mens-volleyball",
  "womens-volleyball",
  "mens-beach-volleyball",
  "womens-beach-volleyball",
  "wbvb",
  "water-polo",
  "mens-water-polo",
  "womens-water-polo",
  "wrestling",
  "mwrest",
  "wwrest",
  "rugby",
  "mens-rugby",
  "womens-rugby",
  "tri",
  "mens-tri",
  "womens-tri",
  "field-hockey",
  "womens-field-hockey",
  "mens-field-hockey",
];

const INTERVAL_MS = 3000;
const MAX_REQUESTS_COUNT = 30;
let PENDING_REQUESTS = 0;

// create new axios instance
const api = axios.create({
  baseURL: "https://ncaa.com",
});

axios.defaults.httpsAgent = new https.Agent({ keepAlive: true });
axios.defaults.maxRedirects = 0;

let successfulTeamWritesCount = 0;
let errorTeamWrites = [];
let totalSchoolsProgress = 0;

axios.interceptors.request.use(function (config) {
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
axios.interceptors.response.use(
  function (response) {
    PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
    return Promise.resolve(response);
  },
  function (error) {
    error.message?.startsWith("connect") &&
      errorTeamWrites.push({ base: error.message.path, error: error.message });
    PENDING_REQUESTS = Math.max(0, PENDING_REQUESTS - 1);
  }
);

https
  .createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/plain");
  })
  .listen(port);

const getSchoolBasePathsFromNcaaIndex = async (page) => {
  const url = "https://www.ncaa.com/schools-index";

  let list = [];

  const path = `${url}/${page}`;
  try {
    const response = await axios.get(path);
    const $ = cheerio.load(response.data);
    $("table.responsive-enabled > tbody > tr > td > a").each(function (
      index,
      element
    ) {
      list.push($(element).attr("href"));
    });
  } catch (er) {
    console.log("GetTeams()", er.message, path);
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

  if (badList.length === 0 || goodList.length < 7) {
    filename = `./${school.name}.REVIEW.json`;
  } else {
    successfulTeamWritesCount++;
    filename = `./${school.name}.json`;
  }
  totalSchoolsProgress++;

  bar1.update(totalSchoolsProgress);

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

const getSchoolRosterPaths = async (teamObject) => {
  /**
   * Gets all possible endpoints for school team rosters
   */
  const allSchoolPossiblePAths = teamObject.map((url, index) => {
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

  allSchoolPossiblePAths.map(async (singleSchoolPossiblePaths) => {
    if (singleSchoolPossiblePaths) {
      const outputObject = {
        base: singleSchoolPossiblePaths.base,
        name: singleSchoolPossiblePaths.schoolName,
        paths: await axios.all(
          singleSchoolPossiblePaths.paths.map(
            async (singleSchoolSingleSportPath) =>
              await axios
                .get(singleSchoolSingleSportPath)
                .then(
                  (res) => res.status === 200 && singleSchoolSingleSportPath
                )
                .catch((err) => {
                  if (!err.response) {
                    return {
                      url: singleSchoolSingleSportPath,
                      reason: err.code,
                    };
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
      writeToJson(outputObject);
    }
  });
};

const convertOutputToArray = (path) => {
  return fs.readFileSync(path, "utf8", function (err, data) {
    return data;
  });
};

const bar1 = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);

let page = 0;

/**
 * main thread
 */
const main = async (p) => {
  let ncaaWebsitePaths = [];
  try {
    // Gets all urls of ncaa university teams on ncaa domain
    ncaaWebsitePaths = await getSchoolBasePathsFromNcaaIndex(p);
  } catch (er) {}

  let teamPaths = [];

  let localErrorCount = 0;

  console.log("\n", `Working on page ${p}`);

  try {
    teamPaths = await axios
      .all(
        ncaaWebsitePaths.map((url) =>
          api.get(url).catch((error) => console.log("line 246", error.message))
        )
      )
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
      .catch((error) => console.log("line 271", error.message));
  } catch (err) {
    console.log("line 265", err.message);
  }

  let validUrls = [];

  try {
    const teams = await getSchoolRosterPaths(teamPaths);
    if (page > 23) {
      bar1.stop();
      process.exit(1);
    } else {
      await main(page++);
    }
  } catch (er) {
    console.log(er);
  }
};

bar1.start(1161, 0);
main(page);
