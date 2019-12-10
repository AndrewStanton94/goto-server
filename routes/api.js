var express = require('express');
var router = express.Router();

const axios = require('axios');
// console.log(`The horse of Death is called ${process.env.death}`);

/* GET users listing. */
router.get('/', function(req, res, next) {
	res.send('respond with a resource');
});

const hasRequiredData = ({ from = false, to = false }) => {
	const validFrom = from && from.location && from.date && from.time;
	const validTo = to && to.location;
	return validFrom && validTo;
};

const generateTimetableURL = ({ from, to }) => {
	const baseURL = 'https://transportapi.com/v3/uk/train/station/';
	return `${baseURL}${from.location}/${from.date}/${from.time}/timetable.json?app_key=${process.env.transportAPI_appKey}&app_id=${process.env.transportAPI_appID}&train_status=passenger&calling_at=${to.location}`;
};

const tidyStopData = (trainJourney) =>
	trainJourney.map(({
		station_code,
		station_name,
		platform,
		aimed_departure_date,
		aimed_departure_time,
		aimed_arrival_date,
		aimed_arrival_time
	}) => ({
		station_code,
		station_name,
		platform,
		aimed_departure_date,
		aimed_departure_time,
		aimed_arrival_date,
		aimed_arrival_time

	}));

/** Takes a route (starting station to destination) and removes fluff. Has summary and info about particular trains running
 * @param  {} {data}
 */
const tidyRouteData = ({ data }) => {
	const {
		date,
		station_name,
		station_code,
		departures
	} = data;

	// Departures gives info about particular trains running. This also needs to be defluffed
	const services = departures.all.map(({
		platform,
		operator_name,
		aimed_departure_time,
		destination_name,
		service_timetable
	}) => ({
		platform,
		operator_name,
		aimed_departure_time,
		destination_name,
		service_timetable: service_timetable.id
	}));

	// Each train has its timetable in a different end point. Follow them
	const getStopsForAllJourneys = services.map(({service_timetable}) =>
		axios.get(service_timetable)
	);

	return Promise.all(getStopsForAllJourneys)
		.then(([...serviceStops]) =>
			// For each timetable get the scheduled stops
			serviceStops.map(({data}) => tidyStopData(data.stops))
		)
		.then((tidiedStopInfo) => {
			// console.log('Tidied stop data: ', tidiedStopInfo);

			const servicesWithStops = services.map((service, i) => {
				service.service_timetable = tidiedStopInfo[i];
				return service;
			});

			const dataToSend = {
				date,
				station_name,
				station_code,
				services: servicesWithStops
			};

			return Promise.resolve(dataToSend);
		});

};

router.post('/', function(req, res, next) {
	const requestData = req.body;

	if (!hasRequiredData(requestData)) {
		res.status(400).send(
			'Require: starting station, starting time and date, and the destination'
		);
	}

	console.log('Data from client: ', requestData);

	axios
		.get(generateTimetableURL(requestData))
		.then(tidyRouteData)
		.then(function( data ) {
			// handle success
			console.log('Data from transportAPI: ', data);
			res.send(data);
		})
		.catch(function(error) {
			// handle error
			console.log(error);
		})
		.finally(function() {
			// always executed
		});

	// res.send('respond with a resource');
});

module.exports = router;
