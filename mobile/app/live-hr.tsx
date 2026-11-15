import React from 'react';
import { Redirect } from 'expo-router';

/** The live heart rate test moved into the WHOOP check page. */
export default function LiveHr() { return <Redirect href="/whoop-check" />; }
