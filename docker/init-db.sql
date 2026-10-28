-- Runs once on first container start (the default `rideshare` db already exists).
CREATE DATABASE rideshare_test;
CREATE EXTENSION IF NOT EXISTS postgis;
\connect rideshare_test
CREATE EXTENSION IF NOT EXISTS postgis;
