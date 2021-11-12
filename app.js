import http from 'http';
import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import cliProgress from 'cli-progress';

const hostname = '127.0.0.1';
const port = 3000;

const multibar = new cliProgress.MultiBar(
  {
    clearOnComplete: false,
    hideCursor: true,
  },
  cliProgress.Presets.shades_grey,
);

const ncaaSports = [
  'mens-cross-country',
  'womens-cross-country',
  'field-hockey',
  'football',
  'mens-soccer',
  'womens-soccer',
  'womens-volleyball',
  'mens-water-polo',
  'mens-basketball',
  'womens-basketball',
  'bowling',
  'fencing',
  'mens-gymnastics',
  'womens-gymnastics',
  'mens-ice-hockey',
  'womens-ice-hockey',
  'rifle',
  'skiing',
  'mens-swimming-and-diving',
  'womens-swimming-and-diving',
  'mens-track-and-field',
  'womens-track-and-field',
  'wrestling',
  'baseball',
  'womens-beach-volleyball',
  'wbvb',
  'mens-golf',
  'womens-golf',
  'mens-lacrosse',
  'womens-lacrosse',
  'rowing',
  'softball',
  'mens-tennis',
  'womens-tennis',
  'mens-volleyball',
  'womens-water-polo',
];

const server = http.createServer((req, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
  getTeams().then(() => 'Upload complete');
});

// const pageProgressBar = multibar.create(24, 0);

const getTeams = async () => {
  const url = 'https://www.ncaa.com/schools-index';

  for (let index = 0; index < 27; index++) {
    try {
      const response = await axios.get(`${url}/${index}`);
      const $ = cheerio.load(response.data);

      let counter = 0;
      $('table.responsive-enabled > tbody > tr > td > a').each(
        async (_idx, el) => {
          const teamName = $(el).text();
          const teamNcaaUrl = `https://www.ncaa.com${$(el).attr('href')}`;

          const teamInfo = await getTeamUrl(teamNcaaUrl);

          const handle = teamInfo?.handle;
          if (teamInfo && teamInfo.teamUrl) {
            const teamUrl = `https://${teamInfo.teamUrl}`;
            const urlList = await getRoster(teamUrl, teamName, handle);
            counter++;
            writeToTextFile(urlList, teamName, counter);
          }
        },
      );
    } catch (error) {}
  }
};

const getTeamUrl = async (url) => {
  try {
    const response = await axios.get(`${url}`);
    const $ = cheerio.load(response.data);
    const team = $('.info').text();
    const splitTeam = team.split('@');
    return { teamUrl: splitTeam[0], handle: `@${splitTeam[1]}` };
  } catch (er) {
    console.log(er.message);
  }
};

const writeToTextFile = (teams, name, counter) => {
  let file_path = '/Users/luke.walz/teamPaths/';
  let file_name = `${name}.txt`;
  var filtered = teams.filter(function (el) {
    return el != null;
  });
  fs.writeFile(file_path + file_name, filtered.join('\r\n'), function (err) {
    if (err) {
      return console.log(err);
    }
  });
};

const getRoster = async (teamUrl) => {
  const promises = ncaaSports.map(async (sport) => {
    let path = `${teamUrl}/sports/${sport}/roster`;
    path = path.replace('landing/index/', '');
    try {
      const response = await axios.get(path, { maxRedirects: 0 });
      if (response.status === 200) {
        return path;
      }
    } catch (er) {}
  });

  const results = await Promise.all(promises);
  return results;
};
