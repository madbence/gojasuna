var https = require('https');
var async = require('async');
var util = require('util');
var fs = require('fs');
var net = require('net');
var token = process.env.TOKEN;

var evfolyamz = {
  '2011': '215343185178200',
  '2012': '343761735699343',
  '2013': '523361764386624'
};

var api = function(url, cb) {
  url = util.format('https://graph.facebook.com/%s?access_token=%s', url, token);
  https.get(url, function(res) {
    if(res.statusCode != 200) {
      return cb(res.headers);
    }
    var raw = '';
    res.on('data', function(chunk) { raw += chunk.toString(); });
    res.on('end', function() {
      try {
        cb(null, JSON.parse(raw));
      } catch(ex) {
        cb(ex);
      }
    });
  });
};

function getMembers(id, fn) {
  api(id + '/members', function(err, res) {
    fn(err, res && res.data);
  });
}

function getChicks(year, fn) {
  var chicks = [];
  getMembers(evfolyamz[year], function(err, res) {
    if(err) {
      return fn(err);
    }
    console.log('%d members found', res.length);
    async.series(res.map(function(member) {
      return function(cb) {
        api(member.id, function(err, res) {
          if(err) return cb(err);
          if(res.gender == 'female') {
            console.log('suna: %s', res.name);
            chicks.push(res);
          } else {
            console.log('      %s', res.name);
          }
          cb();
        });
      };
    }), function(err, res) {
      if(err) {
        return fn(err);
      }
      console.log('done.');
      fn(null, chicks);
    });
  });
}

function reloadChicks(fn) {
  async.series([
    getChicks.bind({}, 2011),
    getChicks.bind({}, 2012),
    getChicks.bind({}, 2013)
  ], function(err, results) {
    async.series([
      fs.writeFile.bind(fs, './chicks_2011.json', JSON.stringify(results[0])),
      fs.writeFile.bind(fs, './chicks_2012.json', JSON.stringify(results[1])),
      fs.writeFile.bind(fs, './chicks_2013.json', JSON.stringify(results[2]))
    ], function(err, res) {
      console.log('Done!');
      fn(err, res);
    });
  });
}

//reloadChicks(function(){}); process.exit();

var client = net.connect(6667, process.env.IRC_SERVER, function() {
  client.write('NICK ' + process.env.NICK + '\r\n');
  client.write('USER ' + process.env.NICK + ' 8 * :Suna masina\r\n');
  client.write('JOIN ' + process.env.CHANNEL + '\r\n');
});

var sunak = {
  '2011': require('./chicks_2011.json'),
  '2012': require('./chicks_2012.json'),
  '2013': require('./chicks_2013.json')
};

client.on('data', function(buf) {
  buf = buf.toString();
  console.log(buf);
  var m = buf.match(/^(:(.*?) )?(.*?) (.*?)\r\n/);
  if(m[3] == 'PING') {
    return client.write('PONG ' + m[4].substr(1) + '\r\n');
  }
  if(m[3] == 'PRIVMSG') {
    var sender = m[2].substr(0, m[2].indexOf('!'));
    m = m[4].match(/(.*?) :(.*)/);
    console.log('message', 'Message from ' + sender + ' to ' + m[1] + ': ' + m[2]);
    var suna = m[2].match(/!suna ?(\d*)/);
    if(!suna) return;
    var year = +suna[1];
    if(year < 2011 || year > 2013) {
      return client.write('PRIVMSG ' + m[1] + ' :2011-13 kozott! (' +
          Object.keys(sunak).map(function(year) {
            return year + '->' + sunak[year].length + 'db';
          }).join(', ') + ')\r\n');
    } else {
      suna = sunak[year][Math.floor(sunak[year].length*Math.random())];
      return client.write('PRIVMSG ' + m[1] + ' :' +
        suna.name + ' (' + suna.link + ')\r\n');
    }
  }
});
