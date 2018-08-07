// Import the installed modules.
const express = require('express');
const responseTime = require('response-time')
const axios = require('axios');
const redis = require('redis');
const client = redis.createClient(process.env.REDIS_URL);

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
