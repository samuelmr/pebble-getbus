var ajax = require('ajax');
var Settings = require('settings');
var UI = require('ui');
var Vector2 = require('vector2');

var MAX_DEPS = 10;
var MAX_STOPS = 10;
var departureURI = "http://pubtrans.it/hsl/reittiopas/departure-api?max=" + MAX_DEPS;
var stopsURI = "http://pubtrans.it/hsl/stops?max=" + MAX_STOPS;
var locationOptions = { "timeout": 15000, "maximumAge": 1000, "enableHighAccuracy": true };
var R = 6371000; // m
var stops = [];
var timeTables = {};
var watcher;

var errorItems = [{title: 'Ei tietoja', subtitle: 'Kokeile uudelleen...'}];
var helpId = 'help';

var favorites = Settings.data('favorites') || [];
var storedLocations = Settings.data('storedLocations') || {};
var stopLocations = storedLocations;

if (typeof(Number.prototype.toRad) === "undefined") {
  Number.prototype.toRad = function() {
    return this * Math.PI / 180;
  };
}
if (typeof(Number.prototype.toDeg) === "undefined") {
  Number.prototype.toDeg = function() {
    return this * 180 / Math.PI;
  };
}

var distfield = new UI.Text({
  position: new Vector2(0, 26),
  size: new Vector2(144, 20),
  font: 'GOTHIC_18',
  backgroundColor: 'black',
  color: 'white',
  text: '',
  textAlign: 'center',
  textOverflow: 'ellipsis'
});

var menu = new UI.Menu({
  sections: [
    {
      title: 'Suosikit',
      items: favorites
    },
    {
      title: 'Lähimmät',
      items: []
    }
  ]
});

var main = new UI.Menu({
  sections: [
    {title: 'Paikannetaan...'}
  ]
});
main.on('select', function(e) {
  timeTables = {};
  if (e.item.id === 0) {
    main.sections([
      {title: 'Paikannetaan...'}
    ]);
    navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);
    menu.items(1, []);
  }
  else {
    refreshStops(favorites);
    refreshStops(stops);
  }
});
main.show();

if (favorites.length > 0) {
  refreshStops(favorites);  
}

navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);

function locationError(error) {
  main.item(0, 0, {title: 'Virhe!', subtitle: 'Yritä uudelleen'});
  console.warn('location error (' + error.code + '): ' + error.message);
}

function locationSuccess(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  main.section(0, {title: 'Paikannettu', items: [
    {
      title: Math.round(lat*10000)/10000 + ',' + Math.round(lon*10000)/10000,
      subtitle: 'Päivitä sijainti'
    }
  ]});
  main.item(0, 1, {title: 'Haetaan pysäkit...'});
  // console.log("Got location " + lat + ',' + lon);
  var href = stopsURI + '&lat=' + lat + '&lon=' + lon;
  // console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    buildStopMenu,
    logError
  );
}

function logError(e) {
  main.item(0, 1, {title: 'Virhe!', subtitle: 'Yritä uudelleen'});
  console.warn("Error getting " + this.href + ": " + e);
}

function buildStopMenu(response) {
  stops = [];
  if (!response || !response.features || !response.features[0]) {
    return false;
  }
  resp: for (var i=0; i<response.features.length; i++) {
    if (!response.features[i]) {
      continue;
    }
    var id = response.features[i].properties.id;
    for (var j=0; j<favorites.length; j++) {
      if (id == favorites[j].id) {
        continue resp;
      }
    }
    var coords = response.features[i].geometry.coordinates;
    stopLocations[id] = {latitude: coords[1], longitude: coords[0]};
    var code = response.features[i].properties.code;
    var name = code + ' ' + utf8(response.features[i].properties.name);
    var dist = response.features[i].properties.dist;
    var addr = utf8(response.features[i].properties.addr);
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
    stops.push({id: id, addr: addr, dist: dist, title: name, subtitle: dist});
  }
  menu.items(1, stops);
  main.item(0, 1, {title: stops.length + ' pysäkkiä', subtitle: 'Päivitä aikataulut'});
  menu.on('select', function(e) {
    var items = timeTables[e.item.id] || errorItems;
    var stopMenu = new UI.Menu({
      sections: [{
        title: e.item.title,
        items: items
      }],
    });
    stopMenu.on('select', function(se){
      if (watcher) {
        navigator.geolocation.clearWatch(watcher);     
      }
      var data = se.item.data;
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
      // var bg = new UI.Rect({ size: Vector2(144, 168), backgroundColor: 'white' });
      // wind.add(bg);
      var stopfield = new UI.Text({
        position: new Vector2(0, 10),
        size: new Vector2(144, 15),
        font: 'GOTHIC_14_BOLD',
        backgroundColor: 'black',
        color: 'white',
        text: utf8(data.stopname),
        textAlign: 'center',
        textOverflow: 'ellipsis'
      });
      wind.add(stopfield);
      distfield.text(e.item.addr);
      wind.add(distfield);
      if (stopLocations[data.stop]) {
        watcher = navigator.geolocation.watchPosition(function(pos) {
          if (stopLocations && stopLocations[data.stop]) {
            var dh = disthead(pos.coords, stopLocations[data.stop]);
            var head = 'pohjoiseen';
            dh.heading = (dh.heading < 0) ? 360 + dh.heading : dh.heading;
            if (dh.heading < 22.5){
              head = 'pohjoiseen';
            }
            else if (dh.heading < 67.5){
              head = 'koilliseen';
            }
            else if (dh.heading < 112.5){
              head = 'itään';
            }
            else if (dh.heading < 157.5){
              head = 'kaakkoon';
            }
            else if (dh.heading < 202.5){
              head = 'etelään';
            }
            else if (dh.heading < 247.5){
              head = 'lounaaseen';
            }
            else if (dh.heading < 292.5){
              head = 'länteen';
            }
            else if (dh.heading < 337.5){
              head = 'luoteeseen';
            }
            distfield.text(Math.round(dh.distance) + ' m ' + head);
          }
        });
      }
      var linefield = new UI.Text({
        position: new Vector2(0, 60),
        size: new Vector2(144, 30),
        font: 'GOTHIC_24',
        backgroundColor: 'white',
        color: 'black',
        text: data.line + ' ' + utf8(data.dest),
        textAlign: 'center',
        textOverflow: 'ellipsis'
      });
      wind.add(linefield);
      var depfield = new UI.Text({
        position: new Vector2(0, 90),
        size: new Vector2(144, 30),
        font: 'BITHAM_30_BLACK',
        backgroundColor: 'white',
        color: 'black',
        text: [d.getHours(), m, s].join(":"),
        textAlign: 'center',
        textOverflow: 'ellipsis'
      });
      wind.add(depfield);
      var timefield = new UI.TimeText({
        position: new Vector2(0, 120),
        size: new Vector2(144, 48),
        font: 'BITHAM_30_BLACK',
        backgroundColor: 'white',
        color: 'black',
        text: '%X',
        textAlign: 'center',
        textOverflow: 'ellipsis'
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
      storedLocations[e.item.id] = stopLocations[e.item.id];
      menu.items(e.sectionIndex).splice(e.itemIndex, 1);
    }
    else {
      // console.log('Removing ' + e.item.id + ' from favorites.');
      e.item.subtitle = e.item.dist;
      menu.items(1).push(e.item);
      favorites.splice(e.itemIndex, 1);
      storedLocations[e.item.id] = null;
    }
    menu.items(0, favorites);
    for (var f in favorites) {
      favorites[f].subtitle = favorites[f].addr;
    }
    Settings.data('favorites', favorites);
    Settings.data('storedLocations', storedLocations);
  });
  if (menu.items(0).length < 1) {
    menu.items(0, [{id: helpId, title: 'Ei suosikkeja', subtitle: 'Ks. lisätietoja...'}]);
  }
  menu.show();
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
        timeTables[helpId] = [{title: 'Lisää suosikki', subtitle: 'pitkään painamalla'}];
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
          timeTables[stopId].push({title: dep.line + ' @ ' + [d.getHours(), m].join(":"),
                                   subtitle: utf8(dep.dest), data: dep});
        }
        for (var sect=0; sect<=1; sect++) {
          for (var it in menu.items(sect)) {
            var current = menu.item(sect, it);
            // console.log('Found item' + current.title);
            if (!current.id || !timeTables[current.id] || (current.id == helpId)) {
              continue;
            }
            var magicSub = (sect == 1) ? current.dist + '   ' : '';
            var nextDeps = [];
            for (var n=0; n<(2-sect); n++) {
              nextDeps.push(timeTables[current.id][n].title);
            }
            magicSub += nextDeps.join(', ');
            var newItem = {id: current.id, title: current.title,
                           subtitle: magicSub};
            menu.item(sect, it, newItem);
          }
        }
      }
    },
    logError
  );
  menu.show();
}

function utf8(str) {
  return unescape(encodeURI(str));
}

function disthead(pos1, pos2) {
  var dLat = (pos2.latitude-pos1.latitude).toRad();
  var dLon = (pos2.longitude-pos1.longitude).toRad();
  // return ({distance: dLat, heading: dLon}); 
  var l1 = pos1.latitude.toRad();
  var l2 = pos2.latitude.toRad();
  var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.sin(dLon/2) * Math.sin(dLon/2) * Math.cos(l1) * Math.cos(l2); 
  var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
  var dist = Math.round(R * c);
  var y = Math.sin(dLon) * Math.cos(l2);
  var x = Math.cos(l1)*Math.sin(l2) -
          Math.sin(l1)*Math.cos(l2)*Math.cos(dLon);
  var head = Math.round(Math.atan2(y, x).toDeg());
  return ({distance: dist, heading: head});
}