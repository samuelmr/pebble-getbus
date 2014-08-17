var ajax = require('ajax');
var Settings = require('settings');
var UI = require('ui');
var Vector2 = require('vector2');

// var MAX_FAVORITES = 4;
var MAX_DEPS = 10;
var MAX_STOPS = 10;
var departureURI = "http://pubtrans.it/hsl/reittiopas/departure-api?max=" + MAX_DEPS;
var stopsURI = "http://pubtrans.it/hsl/stops?max=" + MAX_STOPS;
var locationOptions = { "timeout": 15000, "maximumAge": 1000, "enableHighAccuracy": true };
var timeTables = {};
var errorItems = [{title: 'Ei tietoja', subtitle: 'Kokeile uudelleen...'}];
var helpId = 'help';

var favorites = Settings.data('favorites') || [];
// console.log('Found favorites: ' + favorites);
if (favorites.length > 0) {
  refreshStops(favorites);  
}

var info = new UI.Card({
  title: 'Get Bus',
  // icon: 'images/menu_icon.png',
  subtitle: 'Lahipysakkien tiedot',
  body: 'Paikannetaan...'
});
info.show();

var menu = new UI.Menu({
  sections: [
    {
      title: 'Suosikit',
      items: favorites
    },
    {
      title: 'Lahimmat',
      items: []
    }
  ]
});

navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);

function locationError(error) {
  info.title('Virhe');
  info.subtitle('');
  info.body('Paikannus ei onnistunut. Kaynnista sovellus uudelleen.');
  console.warn('location error (' + error.code + '): ' + error.message);
}

function locationSuccess(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  info.title('Paikannettu');
  info.subtitle(Math.round(lat*100000)/100000 + '\n' + Math.round(lon*100000)/100000);
  info.body('Haetaan pysakit...');
  // console.log("Got location " + lat + ',' + lon);
  var href = stopsURI + '&lat=' + lat + '&lon=' + lon;
  // console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    getStopLines,
    logError
  );
}

function logError(e) {
  info.title('Virhe');
  info.subtitle('');
  info.body('Tietojen lataus ei onnistunut.');
  console.warn("Error getting " + this.href + ": " + e);
}

function getStopLines(response) {
  var stops = [];
  if (!response || !response.features || !response.features[0]) {
    return false;
  }
  info.title('Valmista tuli');
  info.subtitle('');
  info.body('Loytyi ' + response.features.length + ' pysakkia...');
  for (var i=0; i<response.features.length; i++) {
    if (!response.features[i]) {
      continue;
    }
    var id = response.features[i].properties.id;
    for (var j=0; j<favorites.length; j++) {
      if (id == favorites[j].id) {
        continue;
      }
    }
    var name = descandify(response.features[i].properties.name);
    var dist = response.features[i].properties.dist;
    // console.log("got stop: " + id + ", name " + name + ", dist " + dist);
    if (!id || !name || !dist) {
      // console.log("Information missing, skipping stop...");
      continue;
    }
    if (dist > 999) {
      dist = Math.round(dist*10)/10000 + " km";
    }
    else {
      dist = dist + " m";
    }
    stops.push({id: id, title: name, subtitle: dist});
  }
  menu.items(1, stops);
  menu.on('select', function(e) {
    var items = timeTables[e.item.id] || errorItems;
    var stopMenu = new UI.Menu({
      sections: [{
        title: e.item.title,
        items: items
      }]
    });
    stopMenu.on('select', function(e){
      var data = e.item.data;
      if (!data) {
        return false;
      }
      var deptime = data.rtime || data.time;
      var d = new Date(deptime * 1000);
      var m = d.getMinutes();
      m = (m < 10) ? "0" + m.toString() + "" : m;
      var s = d.getSeconds();
      s = (s < 10) ? "0" + s.toString() + "" : s;
      var wind = new UI.Window({fullscreen: true});
      var stopfield = new UI.Text({
        position: new Vector2(0, 0),
        size: new Vector2(144, 30),
        font: 'GOTHIC_24_BOLD',
        text: descandify(data.stopname),
        textAlign: 'center'
      });
      wind.add(stopfield);
      var linefield = new UI.Text({
        position: new Vector2(0, 40),
        size: new Vector2(144, 30),
        font: 'GOTHIC_24',
        text: data.line + ' ' + descandify(data.dest),
        textAlign: 'center'
      });
      wind.add(linefield);
      var depfield = new UI.Text({
        position: new Vector2(0, 80),
        size: new Vector2(144, 30),
        font: 'BITHAM_30_BLACK',
        text: [d.getHours(), m, s].join(":"),
        textAlign: 'center'
      });
      wind.add(depfield);
      var timefield = new UI.TimeText({
        position: new Vector2(0, 120),
        size: new Vector2(144, 30),
        font: 'BITHAM_30_BLACK',
        text: '%H:%M:%S',
        textAlign: 'center'
      });
      wind.add(timefield);   
      wind.show();
    });
    stopMenu.show();
  });
  menu.on('longSelect', function(e) {
    if (e.sectionIndex > 0) {
      // console.log('Adding ' + e.item.id + ' to favorites.');
      favorites.push(e.item);
      menu.items(e.sectionIndex).splice(e.itemIndex, 1);
    }
    else {
      // console.log('Removing ' + e.item.id + ' from favorites.');
      menu.items(1).push(e.item);
      favorites.splice(e.itemIndex, 1);
    }
    Settings.data('favorites', favorites);
    menu.items(0, favorites);
  });
  if (menu.items(0).length < 1) {
    menu.items(0, [{id: helpId, title: 'Ei suosikkeja', subtitle: 'Ks. lisatietoja...'}]);
  }
  menu.show();
  info.hide();
  refreshStops(stops);
}

function refreshStops(stops) {
  if (stops.length <= 0) {
    // console.log("stops.length = " + stops.length);
    return false;
  }
  var href = departureURI;
  for (var i=0; i<stops.length; i++) {
    href += "&stops%5B%5D=" + stops[i].id;
  }
  // console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    function(deps) {
      // console.log("OK, got " + deps.length + " departures");
      if (deps.length) {
        timeTables = {};
        timeTables[helpId] = [{title: 'Lisaa suosikki', subtitle: 'pitkalla painalluksella'}];
        for (var j=0; j<deps.length; j++) {
          var dep = deps[j];
          var stopId = dep.stop;
          if (!timeTables[stopId]) {
            timeTables[stopId] = [];
          }
          var time = dep.rtime || dep.time;
          var d = new Date(time * 1000);
          var m = d.getMinutes();
          m = (m < 10) ? "0" + m.toString() + "" : m;
          timeTables[stopId].push({title: [d.getHours(), m].join(":") + ' ' + dep.line, subtitle: descandify(dep.dest), data: dep});
        }
        for (var sect=0; sect<=1; sect++) {
          for (var it in menu.items(sect)) {
            var current = menu.item(sect, it);
            // console.log('Found item' + current.title);
            if (!current.id || !timeTables[current.id] || (current.id == helpId)) {
              continue;
            }
            var firstDep = timeTables[current.id][0];
            var newItem = {id: current.id, title: current.title,
                           subtitle: current.subtitle + ', ' + firstDep.title};
            menu.item(sect, it, newItem);
          }
        }
      }
    },
    logError
  );
}

function descandify(str) {
  str = escape(str).replace(/%20/g, ' ');
  str = str.replace(/%E8|%E9/g, 'e').replace(/%C8|%C9/g, 'E');
  str = str.replace(/%E5|%E4/g, 'a').replace(/%C5|%C4/g, 'A');
  str = str.replace(/%F6/g, 'o').replace(/%D6/g, 'O');
  return str;
}
