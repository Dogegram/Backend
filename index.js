require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const mongoose = require('mongoose');
const compression = require('compression');
const path = require('path');
const socketio = require('socket.io');
const jwt = require('jwt-simple');
const connectToDb = require("./utils/db");
const multer = require('multer');

const Sentry = require('@sentry/node');
const Tracing = require("@sentry/tracing");

const apiRouter = require('./routes');

const app = express();
const PORT = process.env.PORT || process.env.OPEN_PORT || 5000;

Sentry.init({
  dsn: "https://9ae2832420774e2fa3975bc51b02144e@o679108.ingest.sentry.io/5769445",
  integrations: [
    new Sentry.Integrations.Http({ tracing: true }),
    new Tracing.Integrations.Express({ app }),
  ],

  // To-Do Before release, change this to a higher value before production release
  tracesSampleRate: 8,
});

connectToDb();



if (process.env.NODE_ENV != 'production') {
  const morgan = require('morgan');
  app.use(morgan('dev'));
}



app.use(  Sentry.Handlers.requestHandler({
  serverName: false,
  ip: false
}));
app.use(Sentry.Handlers.tracingHandler());

app.use(helmet());
app.use(helmet.hidePoweredBy());
var corsOptions = {
  origin: ["https://dogegram.xyz", /\.dogegram\.xyz$/, "https://localhost:3000"],
  exposedHeaders:'*',
  optionsSuccessStatus: 200, // some legacy browsers (IE11, various SmartTVs) choke on 204
  allowedHeaders: '*'
}
app.use(cors(corsOptions));
app.use('/api/payment/webhook', bodyParser.raw({type: "*/*"}))
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());
app.set('trust proxy', 1);
/*app.use((req, res, next) => {
=======
app.use((req, res, next) => {
  res.header("Access-Control-Max-Age", "7150");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, X-Req-Country");
  res.header("X-Req-IP", req.header("cf-connecting-ip"));
  res.header("X-Req-Country", req.header("cf-ipcountry"));
  next();
});*/
app.use('/api', apiRouter);

app.get('/', (req, res)=>{
  // Test zone, test out some stuff
  // throw new Error("Test Error")
  res.send("Dogegram Backend Internal Server")
})



app.use(
  Sentry.Handlers.errorHandler()
);


app.use(function onError(err, req, res, next) {
  // The error id is attached to `res.sentry` to be returned
  // and optionally displayed to the user for support.
  if(err instanceof multer.MulterError){
    return res.status(400).send({error: err.message})
  }
  res.statusCode = 500;
  res.end(`An unexpected error ocurred, Request Trace ID: ${res.sentry}`);
});


const expressServer = app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

const io = socketio(expressServer);
app.set('socketio', io);
console.log('Socket.io listening for connections');

// Authenticate before establishing a socket connection
io.use((socket, next) => {
  const token = socket.handshake.query.token;
  if (token) {
    try {
      const user = jwtu.verify(token, process.env.JWT_SECRET);
      if (!user) {
        return next(new Error('Not authorized.'));
      }
      socket.user = user;
      return next();
    } catch (err) {
      next(err);
    }
  } else {
    return next(new Error('Not authorized.'));
  }
}).on('connection', (socket) => {
  socket.join(socket.user.id);
 // console.log(`socket connected id: ${socket.id}, username: ${socket.user.id}`);
});