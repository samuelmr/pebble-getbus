var UI = require('ui');
var Vector2 = require('vector2');
var ajax = require('ajax');

// var MAX_FAVORITES = 4;
var MAX_DEPS = 10;
// var MAX_DEPS_PER_STOP = 7;
var MAX_STOPS = 10;
var departureURI = "http://pubtrans.it/hsl/reittiopas/departure-api?max=" + MAX_DEPS;
var stopsURI = "http://pubtrans.it/hsl/stops?max=" + MAX_STOPS;
var locationOptions = { "timeout": 15000, "maximumAge": 1000, "enableHighAccuracy": true };
var timeTables = {};
var info;
var menu;
var errorItems = [{title: 'No data', subtitle: 'Timetable not found'},
                  {title: 'Try again later', subtitle: 'Sorry for inconvenience!'}];

info = new UI.Card({
  title: 'HSL Stops',
  // icon: 'images/menu_icon.png',
  subtitle: 'Next departures near you',
  body: 'Locating...'
});
info.show();

navigator.geolocation.getCurrentPosition(locationSuccess, locationError, locationOptions);

function locationError(error) {
  info.title('Error');
  info.subtitle('');
  info.body('Location error! Restart app.');
  console.warn('location error (' + error.code + '): ' + error.message);
}

function locationSuccess(position) {
  var lat = position.coords.latitude;
  var lon = position.coords.longitude;
  info.title('Located');
  info.subtitle(Math.round(lat*100000)/100000 + '\n' + Math.round(lon*100000)/100000);
  info.body('Getting stops...');
  console.log("Got location " + lat + ',' + lon);
  var href = stopsURI + '&lat=' + lat + '&lon=' + lon;
  console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    getStopLines,
    logError
  );
}

function logError(e) {
  info.title('Error');
  info.subtitle('');
  info.body('Data retrieval error! Restart app.');
  console.log("Error getting " + this.href + ": " + e);
}

function getStopLines(response) {
  var stops = [];
  if (!response || !response.features || !response.features[0]) {
    return false;
  }
  info.title('Data found');
  info.subtitle('');
  info.body('Found ' + response.features.length + ' stops...');
  for (var i=0; i<response.features.length; i++) {
    if (!response.features[i]) {
      continue;
    }
    var id = response.features[i].properties.id;
    // var name = decode_utf8(response.features[i].properties.name);
    var name = descandify(response.features[i].properties.name);
    // var name = response.features[i].properties.name;
    var dist = response.features[i].properties.dist;
    console.log("got stop: " + id + ", name " + name + ", dist " + dist);
    if (!id || !name || !dist) {
      console.log("Information missing, skipping stop...");
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
  menu = new UI.Menu({
    sections: [{
      // todo: add favorites
      title: 'Near',
      items: stops
    }]
  });
  menu.on('select', function(e) {
    // console.log('Selected item #' + e.itemIndex + ' of section #' + e.sectionIndex);
    // console.log('The item is id "' + e.item.id + '" and titled "' + e.item.title + '"');
/*
*/
    var items = timeTables[e.item.id] || errorItems;
    var stopMenu = new UI.Menu({
      sections: [{
        // todo: add favorites
        title: e.item.title,
        items: items
      }]
    });
    stopMenu.on('select', function(e){
      var data = e.item.data;
      var deptime = data.rtime || data.time;
      var d = new Date(deptime * 1000);
      var m = d.getMinutes();
      m = (m < 10) ? "0" + m.toString() + "" : m;
      var s = d.getSeconds();
      s = (s < 10) ? "0" + s.toString() + "" : s;
      console.log('deptime: ' + deptime + ', d: ' + d);
      var wind = new UI.Window();
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
        // color: 'white',
        font: 'BITHAM_30_BLACK',
        text: '%H:%M:%S',
        textAlign: 'center'
      });
      wind.add(timefield);   
      // var rect = new UI.Rect({ size: Vector2(20, 20) });
      // wind.add(rect);
      wind.show();
    });
    stopMenu.show();
  });
  menu.show();
  info.hide();
  refreshStops(stops);
}

function refreshStops(stops) {
  if (stops.length <= 0) {
    console.log("stops.length = " + stops.length);
    return false;
  }
  var href = departureURI;
  for (var i=0; i<stops.length; i++) {
    href += "&stops%5B%5D=" + stops[i].id;
  }
  console.log("Getting " + href);
  ajax(
    {url: href, type: 'json'},
    function(deps) {
      console.log("OK, got " + deps.length + " departures");
      if (deps.length) {
        timeTables = {};
        for (i=0; i<deps.length; i++) {
          var dep = deps[i];
          var stopId = dep.stop;
          if (!timeTables[stopId]) {
            timeTables[stopId] = [];
          }
          var time = dep.rtime || dep.time;
          var d = new Date(time * 1000);
          var m = d.getMinutes();
          m = (m < 10) ? "0" + m.toString() + "" : m;
          // timeTables[stopId].push({title: dep.time + ' ' + dep.line, subtile: decode_utf8(dep.dest)});
          timeTables[stopId].push({title: [d.getHours(), m].join(":") + ' ' + dep.line, subtitle: descandify(dep.dest), data: dep});
          console.log("route '" + dep.route + "' @ " + [d.getHours(), m].join(":") + " found!");
          // console.log(timeTables[stopId]);
        }
        // todo: set the index to 1 if favorites become #0
        for (var it in menu.items(0)) {
          var current = menu.item(0, it);
          var firstDep = timeTables[current.id][0];
          var newItem = {id: current.id, title: current.title,
                         subtitle: current.subtitle + ', ' + firstDep.title};
          menu.item(0, it, newItem);
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

// function decode_utf8(s) {
//   return decodeURIComponent(escape(s));
// }
