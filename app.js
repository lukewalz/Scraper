import http from 'http';
import axios from 'axios';
import cheerio from 'cheerio';
import { createObjectCsvWriter } from 'csv-writer';

const hostname = '127.0.0.1';
const port = 3000;

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
  'Beach Volleyball',
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
  res.end('Hello World');
});

server.listen(port, hostname, () => {
  console.log(`Server running at http://${hostname}:${port}/`);
  getTeams().then(() => 'Upload complete');
});

const getTeams = async () => {
  const url = 'https://www.ncaa.com/schools-index';
  const teams = [];
  for (let index = 0; index < 27; index++) {
    try {
      const response = await axios.get(`${url}/${index}`);
      const $ = cheerio.load(response.data);

      $('table.responsive-enabled > tbody > tr > td > a').each(
        async (_idx, el) => {
          const teamName = $(el).text();
          const teamNcaaUrl = `https://www.ncaa.com${$(el).attr('href')}`;

          const teamInfo = await getTeamUrl(teamNcaaUrl);

          const handle = teamInfo?.handle;
          const teamUrl = `https://${teamInfo?.teamUrl}`;
          if (teamUrl) {
            getRoster(teamUrl, teamName, handle).then(() =>
              console.log(`Completed exporting ${teamName} athletes`),
            );
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
    console.log(url);
  }
};

const writeToTeamExcel = (teams) => {
  const csvWriter = createObjectCsvWriter({
    path: 'teamData.csv',
    header: [
      { id: 'FirstName', title: 'First Name' },
      { id: 'LastName', title: 'Last Name' },
      { id: 'Sport', title: 'sport' },
      { id: 'Position', title: 'Position' },
      { id: 'University', title: 'Team Name' },
      { id: 'TeamTwitterHandle', title: 'Handle' },
    ],
  });

  csvWriter
    .writeRecords(teams)
    .then(() => console.log('The CSV file was written successfully'));
};

const getRoster = async (teamUrl, teamName, handle) => {
  ncaaSports.map(async (sport) => {
    try {
      const response = await axios
        .get(`${teamUrl}/sports/${sport}/roster?print=true`)
        .catch((error) => {});
      const team = [];
      if (response.status === 200) {
        const $ = cheerio.load(response.data);
        const pl = [];
        $('tbody > tr').each((id, element) => {
          const number = $(element).find('.roster_jerseynum').text();
          const name = $(element).find('.sidearm-table-player-name > a').text();
          const [firstName, lastName] = name.split(' ');
          const position = $(element).find('.rp_position_short').text();
          const year = $(element).find('.roster_class').text();
          const hometown = $(element).find('.hometownhighschool').text();
          const player = {
            AthleteId: 0,
            FirstName: firstName,
            LastName: lastName,
            University: teamName,
            Sport: sport,
            Position: position,
            TeamTwitterHandle: handle,
          };
          if (name) {
            team.push(player);
          }
        });

        console.log(team);

        try {
          axios.post('http://localhost:54661/athlete', team);
        } catch (error) {
          console.warn(error);
        }
      }
    } catch (e) {}
  });
};
