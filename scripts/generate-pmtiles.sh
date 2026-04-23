#!/usr/bin/env bash
# Requires tippecanoe installed
wget https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=geojson -O brasil.geojson
tippecanoe -o brasil-municipios.pmtiles -z10 -Z4 --drop-densest-as-needed brasil.geojson
gsutil cp brasil-municipios.pmtiles gs://transparenciabr.appspot.com/geo/
