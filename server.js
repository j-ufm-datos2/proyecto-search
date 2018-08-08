// Import the installed modules.
const Influx = require('influx');
const express = require('express');
const responseTime = require('response-time')
const axios = require('axios');
const redis = require('redis');

const client = redis.createClient(process.env.REDIS_URL);

const influx = new Influx.InfluxDB({
 host: "localhost",
 database: "api_response_times",
 schema: [
   {
     measurement: "response_times",
     fields: {
       //userid: Influx.FieldType.INTEGER,
       response_time: Influx.FieldType.FLOAT,
       query: Influx.FieldType.STRING,
       raw: Influx.FieldType.STRING
     },
     tags: [
       "github"
     ]
   }
 ]
});

influx.getDatabaseNames()
  .then(names => {
    if (!names.includes('api_response_times')) {
      return influx.createDatabase(dbname);
    }
  });


function saveTweetToInflux(result) {
  influx.writePoints([
    {
      measurement: 'response_times',
      tags: {                        // array of matched keywords
        keywords: (result.tags.length > 0 ? result.tags.join(",") : [])
      },
      fields: {
        response_time: result.response,
        query: result.query,
        raw: result.resultJSON,
      },
    }
  ]).catch(err => {
    console.error(`Error saving data to InfluxDB! ${err.stack}`);
  });
}

const app = express();

app.use(responseTime());





app.get('/api/search', (req, res) => {
  // Extract the query from url and trim trailing spaces
  const query = (req.query.query).trim();

  const searchUrl = `https://api.github.com/search/repositories?q=${query}`;

  // Try fetching the result from Redis first in case we have it cached
  return client.get(`github:${query}`, (err, result) => {
    // If that key exist in Redis store
    if (result) {
      const resultJSON = JSON.parse(result);
      return res.status(200).json(resultJSON);
    } else {
      // Fetch directly from API
      return axios.get(searchUrl)
        .then(response => {
          const responseJSON = response.data;
          // Save API response in Redis
          client.setex(`github:${query}`, 3600, JSON.stringify({ source: 'Redis Cache', ...responseJSON, }));
          // Send JSON
          console.log(res.status(200).json({ source: 'Github API', ...responseJSON, }));
          return res.status(200).json({ source: 'Github API', ...responseJSON, });
        })
        .catch(err => {
          return res.json(err);
        });
    }
  });
});

app.listen(3000, () => {
  console.log('Server listening on port: ', 3000);
});
