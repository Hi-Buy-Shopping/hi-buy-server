import socketIo from 'socket.io';
import http from 'http';
import express from 'express';
import { dbConnect } from '../database/dbConfig';
import mssql from 'mssql'

const app = express()

  