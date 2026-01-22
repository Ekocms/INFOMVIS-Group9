# Naturvation Decision Support Visualization
## Abstract
This project presents an interactive, web-based visualization tool that supports exploratory decision-making for Nature-Based Solutions (NbS). This project combined coordinated views, including a world map, Sankey diagram, bar chart, and status overview, which enables users to analyze NbS projects across geographical regions, sustainability challenges, intervention types, and implementation status. The interface follows a progressive disclosure approach, allowing users to move from a global overview to detailed project-level information and comparison. The tool is designed to help policymakers, researchers, and practitioners better understand patterns, trade-offs, and opportunities within the Naturvation Atlas dataset.

## External Libraries and Resources
- D3.js (v7):
  
  Used for all visualizations and interactions.
- d3-sankey:
  
  Used to construct the Challenge → Type Sankey diagram.
- TopoJSON Client:
  
  Used to render the world map from geographic data.
- Bootstrap (CSS only):
  
  Used for basic UI elements such as buttons and dropdowns.
  
## Project Structure
### Code
- index.html
  
  Main HTML file defining the dashboard layout and UI structure.
- js/app.js
  
  Core application logic implemented with D3.js. Includes data loading, filtering logic, cross-view coordination, map interaction, and project detail overlays.
- js/data_generator.js
  
  A utility script developed by the team to generate and simulate data for testing and demonstration purposes.
- css/style.css
  
  Custom styling for dashboard layout, panels, filters, and overlays.

### Data Files
- cleaned_data.csv / cleaned_data.xlsx:
  
  Cleaned NbS project dataset derived from the Naturvation Atlas.
- world_countries_110m.topojson:
  
  World map geometry used for the geographic visualization.
- geocoded_*.csv:
  
  Geocoded project locations (latitude and longitude).

## How to Run the Project
Using VS Code:
- Open the project folder in VS Code.
- Install the Live Server extension.
- Right-click index.html.
- Select “Open with Live Server”.
- The dashboard will open in your browser.

## Team Members
Hannah Melissa Lear (8094152)

Jelke

Yixuan An (9750134)
