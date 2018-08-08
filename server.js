// Import the installed modules.
const Influx = require('influx');
const express = require('express');
const responseTime = require('response-time');
const axios = require('axios');
const redis = require('redis');

const client = redis.createClient(process.env.REDIS_URL);

const influx = new Influx.InfluxDB({
 host: '10.92.205.85',
 database: 'express_response_db',
 schema: [
   {
     measurement: 'response_times',
     fields: {
       response_time: Influx.FieldType.FLOAT,
       source: Influx.FieldType.STRING,
       query: Influx.FieldType.STRING,
       raw: Influx.FieldType.STRING
     },
     tags: [
       'host'
     ]
   }
 ]
});



function saveRequestInflux(result) {

  influx.writePoints([
    {
      measurement: 'response_times',
      tags: { host: 'api' },
      fields: {
        response_time: result.response_time,
        source: result.source,
        query: result.query,
        raw: JSON.stringify(result.items)
      }
    }
  ]).catch(err => {
    console.error(`Error saving data to InfluxDB! ${err.stack}`)
  });
}

const app = express();

app.use(responseTime());

app.get('/api/search', (req, res) => {
  // Extract the query from url and trim trailing spaces
  const query = (req.query.query).trim();
  const start = Date.now();
  const searchUrl = `https://api.github.com/search/repositories?q=${query}`;
  // Try fetching the result from Redis first in case we have it cached
  return client.get(`github:${query}`, (err, result) => {
    // If that key exist in Redis store
    if (result) {
      const resultJSON = JSON.parse(result);
      const duration = Date.now() - start;
      console.log(duration);
      resultJSON.response_time = duration;
      saveRequestInflux(resultJSON);
      return res.status(200).json(resultJSON);
    } else {
      // Fetch directly from API
      return axios.get(searchUrl)
        .then(response => {
          const duration = Date.now() - start;
          console.log(duration);
          const responseJSON = response.data;
          // Save API response in Redis
          client.setex(`github:${query}`, 3600, JSON.stringify({query: `${query}`, source: 'Redis Cache', ...responseJSON, }));
          // Send JSON
          saveRequestInflux({response_time: duration, query: `${query}`, source: 'Github API', ...responseJSON, });
          //console.log(to_influx);
          return res.status(200).json({response_time: duration, query: `${query}`, source: 'Github API', ...responseJSON, });
        })
        .catch(err => {
          return res.json(err);
        });
    }
  });
});

influx.getDatabaseNames()
  .then(names => {
    if (!names.includes('express_response_db')) {
      return influx.createDatabase('express_response_db')
    }
  })
  .then(() => {
    app.listen(3000, function () {
      console.log('Listening on port 3000')
    })
  })
  .catch(err => {
    console.error(`Error creating Influx database!`)
  });
