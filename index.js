const express = require("express");
const app = express();
const cors = require("cors");
const { MongoClient, ServerApiVersion } = require("mongodb");
require("dotenv").config();
const port = process.env.PORT || 8000;

app.use(cors());
app.use(express.json());
const uri = `mongodb+srv://${process.env.user}:${process.env.pass}@cluster0.clbkfrr.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});
class PriorityQueue {
  constructor() {
    this.heap = [];
  }

  enqueue(item, priority) {
    this.heap.push({ item, priority });
    this.heap.sort((a, b) => a.priority - b.priority);
  }

  dequeue() {
    if (this.isEmpty()) {
      return null;
    }
    return this.heap.shift().item;
  }

  isEmpty() {
    return this.heap.length === 0;
  }
}
async function run() {
  try {
    await client.connect();
    const db = client.db("samuraiPreli");
    const userCollection = db.collection("users");
    const stationCollection = db.collection("stations");
    const trainCollection = db.collection("trains");

    app.post("/api/users", async (req, res) => {
      const result = await userCollection.insertOne(req.body);
      const response = {
        user_id: req.body.user_id,
        user_name: req.body.user_name,
        balance: req.body.balance,
      };
      res.status(201).json(response);
    });

    app.post("/api/stations", async (req, res) => {
      const result = await stationCollection.insertOne(req.body);
      const response = {
        station_id: req.body.station_id,
        station_name: req.body.station_name,
        longitude: req.body.longitude,
        latitude: req.body.latitude,
      };
      res.status(201).json(response);
    });

    app.post("/api/trains", async (req, res) => {
      const result = await trainCollection.insertOne(req.body);

      const trainData = req.body;
      const serviceStart = trainData.stops[0]?.departure_time;
      const lastIndex = trainData.stops?.length - 1;
      const serviceEnd =
        trainData.stops[lastIndex]?.arrival_time ||
        trainData.stops[lastIndex]?.departure_time;
      const numStations = trainData.stops?.length;

      const response = {
        train_id: trainData.train_id,
        train_name: trainData.train_name,
        capacity: trainData.capacity,
        service_start: serviceStart,
        service_ends: serviceEnd,
        num_stations: numStations,
      };
      res.status(201).json(response);
    });


    app.get("/api/stations", async (req, res) => {
      const stations = await stationCollection
        .find()
        .sort({ station_id: 1 })
        .toArray();
      const stationsWithoutId = stations.map((station) => {
        const { _id, ...rest } = station;
        return rest;
      });
      const response = {
        stations: stationsWithoutId,
      };

      res.status(200).json(response);
    });

    app.get("/api/stations/:station_id/trains", async (req, res) => {
      const stationId = parseInt(req.params.station_id);
      const query = { station_id: stationId };
      const stations = await stationCollection.findOne(query);
      if (!stations) {
        return res.status(404).json({
          message: `station with id: ${stationId} was not found`,
        });
      }
      const trains = await trainCollection.find().toArray();

      const relevantTrains = trains.filter((train) =>
        train.stops.some((stop) => stop.station_id === stationId)
      );
      relevantTrains.sort((a, b) => {
        const aStop = a.stops.find((stop) => stop.station_id === stationId);
        const bStop = b.stops.find((stop) => stop.station_id === stationId);
        const departureTimeComparison = compareTimes(
          aStop.departure_time,
          bStop.departure_time
        );

        if (departureTimeComparison !== 0) {
          return departureTimeComparison;
        }
        const arrivalTimeComparison = compareTimes(
          aStop.arrival_time,
          bStop.arrival_time
        );

        if (arrivalTimeComparison !== 0) {
          return arrivalTimeComparison;
        }
        return a.train_id - b.train_id;
      });

      function compareTimes(timeA, timeB) {
        if (timeA === null && timeB === null) {
          return 0;
        } else if (timeA === null) {
          return -1;
        } else if (timeB === null) {
          return 1;
        } else {
          return timeA.localeCompare(timeB);
        }
      }
      const response = {
        station_id: stationId,
        trains: relevantTrains.map((train) => {
          const stop = train.stops.find(
            (stop) => stop.station_id === stationId
          );
          return {
            train_id: train.train_id,
            arrival_time: stop.arrival_time,
            departure_time: stop.departure_time,
          };
        }),
      };

      res.status(200).json(response);
    });

    app.put("/api/wallets/:wallet_id", async (req, res) => {
      const walletId = parseInt(req.params.wallet_id);
      const amount = req.body.recharge;
      const query = { user_id: walletId };
      const wallet = await userCollection.findOne(query);
      if (!wallet) {
        return res.status(404).json({
          message: `wallet with id: ${walletId} was not found`,
        });
      }

      if (amount < 100 || amount > 10000) {
        return res.status(400).json({
          message: `invalid amount: ${amount}`,
        });
      }
      const newAmount = wallet.balance + amount;
      const updateDoc = {
        $set: {
          balance: newAmount,
        },
      };
      const updated_wallet = await userCollection.updateOne(query, updateDoc, {
        upsert: true,
      });
      const response = {
        wallet_id: walletId,
        balance: newAmount,
        wallet_user: {
          user_id: wallet.user_id,
          user_name: wallet.user_name,
        },
      };

      res.status(200).json(response);
    });

    app.get("/api/wallets/:walletId", async (req, res) => {
      const walletId = parseInt(req.params.walletId);
      const query = { user_id: walletId };
      const wallet = await userCollection.findOne(query);
      if (!wallet) {
        return res.status(404).json({
          message: `wallet with id: ${walletId} was not found`,
        });
      }

      const response = {
        wallet_id: walletId,
        balance: wallet.balance,
        wallet_user: {
          user_id: wallet.user_id,
          user_name: wallet.user_name,
        },
      };

      res.status(200).json(response);
    });


    app.post("/api/tickets", async (req, res) => {
      const walletId = parseInt(req.body.wallet_id);
      const timeAfter = req.body.time_after;
      const stationFrom = parseInt(req.body.station_from);
      const stationTo = parseInt(req.body.station_to);

      const wallet = await userCollection.findOne({ user_id: walletId });
      const balance = wallet ? wallet.balance : 0;
      const ticketId = generateUniqueTicketId();

      const trains = await trainCollection.find().toArray();
      const graph = buildGraph(trains);

      const source = stationFrom;
      const destination = stationTo;
      const optimalPath = findOptimalPath(
        graph,
        source,
        destination,
        timeAfter
      );
      if (optimalPath === -1) {
        return res.status(403).json({
          message: `no ticket available for station: ${stationFrom} to station: ${stationTo}`,
        });
      }
      const cost = optimalPath.cost;
      if (balance < cost) {
        return res.status(403).json({
          message: `recharge amount: ${cost - balance} to purchase the ticket`,
        });
      }
      await userCollection.updateOne(
        { user_id: walletId },
        { $set: { balance: balance - cost } }
      );
      const response = {
        ticket_id: ticketId,
        balance: balance - cost,
        wallet_id: walletId,
        stations: optimalPath.stations,
      };
      res.status(201).json(response);
    });

    app.get("/api/routes", async (req, res) => {
      const station_from = req.query.from;
      const station_to = req.query.to;
      const optimize = req.query.optimize;

      const trains = await trainCollection.find().toArray();
      const graph = buildGraph(trains);
      const source = station_from;
      const destination = station_to;
      const optimalPath = findOptimalPath2(
        graph,
        source,
        destination,
        optimize
      );
      if (optimalPath === -1) {
        return res.status(403).json({
          message: `no routes available for station: ${station_from} to station: ${station_to}`,
        });
      }
      const cost = optimalPath.cost;
      const time = optimalPath.time;
      const response = {
        total_time: time,
        total_cost: cost,
        stations: optimalPath.stations,
      };
      res.status(201).json(response);
    });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
    /* For Running server always */
  }
}
run().catch(console.dir);
function buildGraph(trains) {
  const graph = {};

  trains.forEach((train) => {
    train.stops.forEach((stop, index) => {
      if (!graph[stop.station_id]) {
        graph[stop.station_id] = {};
      }

      if (index < train.stops.length - 1) {
        const nextStop = train.stops[index + 1];
        graph[stop.station_id][nextStop.station_id] = {
          train_id: train.train_id,
          fare: nextStop.fare,
          departureTime: nextStop.departure_time,
          arrivalTime: stop.arrival_time,
        };
      }
    });
  });

  return graph;
}
function findOptimalPath(graph, source, destination, balance, timeAfter) {
  const pq = new PriorityQueue();
  pq.enqueue({ station_id: source, balance, time: timeAfter, path: [] }, 0);

  const visited = new Set();

  while (!pq.isEmpty()) {
    const { station_id, balance, time, path } = pq.dequeue();

    if (station_id === destination) {
      return {
        balance,
        stations: path,
      };
    }

    if (visited.has(station_id)) {
      continue;
    }
    visited.add(station_id);

    if (!graph[station_id]) {
      continue;
    }

    for (const neighbor of Object.keys(graph[station_id])) {
      const { train_id, fare, departureTime, arrivalTime } =
        graph[station_id][neighbor];
      if (!visited.has(neighbor) && balance >= fare && time <= departureTime) {
        const newPath = [
          ...path,
          {
            station_id: neighbor,
            train_id,
            departure_time: departureTime,
            arrival_time: arrivalTime,
          },
        ];
        pq.enqueue(
          {
            station_id: neighbor,
            balance: balance - fare,
            time: arrivalTime,
            path: newPath,
          },
          0
        );
      }
    }
  }

  return -1;
}
function findOptimalPath2(graph, source, destination, timeAfter, optimizeBy) {
  const pq = new PriorityQueue();
  pq.enqueue({ station_id: source, time: timeAfter, path: [], cost: 0 }, 0);

  const visited = new Map();

  while (!pq.isEmpty()) {
    const { station_id, time, path, cost } = pq.dequeue();

    if (station_id === destination) {
      return {
        cost,
        time: time - timeAfter,
        stations: path,
      };
    }

    if (visited.has(station_id) && visited.get(station_id) < cost) {
      continue;
    }
    visited.set(station_id, cost);

    if (!graph[station_id]) {
      continue;
    }

    for (const neighbor of graph[station_id]) {
      const { train_id, fare, departureTime, arrivalTime, next_station } =
        neighbor;
      if (time <= departureTime) {
        const newPath = [
          ...path,
          {
            station_id,
            train_id,
            departure_time: departureTime,
            arrival_time: arrivalTime,
          },
        ];
        pq.enqueue(
          {
            station_id: next_station,
            time: arrivalTime,
            path: newPath,
            cost: cost + fare,
          },
          optimizeBy === "time" ? arrivalTime : cost + fare
        );
      }
    }
  }

  return -1;
}

function generateUniqueTicketId() {
  return Math.floor(Math.random() * 1000) + 1;
}
//Default
app.get("/", (req, res) => {
  res.send("Samurai Preli server is running!");
});
app.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
