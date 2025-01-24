require('dotenv').config();
const express = require('express');
const { MongoClient, ServerApiVersion } = require('mongodb');
const cors = require('cors');

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.z4bua.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // await client.connect();

    const userCollection = client.db('bloodDb').collection('users');
    const donationRequestCollection = client.db('bloodDb').collection('donationRequests');
    const blogCollection = client.db('bloodDb').collection('blog');
    const donationCollection = client.db("bloodDb").collection("requests");

    // Register User Endpoint
    app.post('/register', async (req, res) => {
      try {
        const user = req.body;
        const { email, name, avatar, bloodGroup, district, upazila, password } = req.body;
        const query = { email: user.email };

        // Check if the user already exists
        const existingUser = await userCollection.findOne({ email });
        if (existingUser) {
          return res.status(400).send({ message: 'User already exists!' });
        }

        // Create a new user object
        const newUser = {
          email,
          name,
          avatar,
          bloodGroup,
          district,
          upazila,
          password,
          role: 'donor',
          status: 'active',
        };

        // Insert the new user into the database
        const result = await userCollection.insertOne(newUser);
        console.log('User registered successfully:', result);
        res.status(201).send({
          message: 'User registered successfully!',
          userId: result.insertedId,
        });
      } catch (error) {
        console.log('Error registering user:', error); // Log the error for debugging purposes
        res.status(500).send({
          message: 'An error occurred while registering the user.',
          error: error.message, // Optionally send the error message to the client
        });
      }
    });


    // Get All Users Endpoint
    app.get('/users', async (req, res) => {
      const users = await userCollection.find().toArray();
      res.send(users);
    });

    // Create Donation Request Endpoint
    app.post('/donation-requests', async (req, res) => {
      const {
        requesterName,
        requesterEmail,
        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage,
      } = req.body;

      const requestingUser = await userCollection.findOne({ email: requesterEmail });

      if (!requestingUser || requestingUser.status === 'blocked') {
        return res.status(403).send({ message: 'Blocked users cannot create donation requests.' });
      }

      const newRequest = {
        requesterName,
        requesterEmail,
        recipientName,
        recipientDistrict,
        recipientUpazila,
        hospitalName,
        fullAddress,
        bloodGroup,
        donationDate,
        donationTime,
        requestMessage,
        donationStatus: 'pending',
        createdAt: new Date(),
      };

      const result = await donationRequestCollection.insertOne(newRequest);
      res.status(201).send({
        message: 'Donation request created successfully!',
        requestId: result.insertedId,
      });
    });

    // Get 3 Recent Donation Requests for a Donor
    app.get('/recent-donation-requests', async (req, res) => {
      const { email } = req.query;

      if (!email) {
        return res.status(400).send({ message: 'User email is required' });
      }

      const user = await userCollection.findOne({ email });
      if (!user || user.role !== 'donor') {
        return res.status(403).send({ message: 'Unauthorized access' });
      }

      const recentRequests = await donationRequestCollection
        .find({ requesterEmail: email, })
        .sort({ createdAt: -1 })
        .limit(3)
        .toArray();

      res.send(recentRequests);
    });

    // Fetch details of a specific donation request by ID
    app.get('/donation-requests/:id', async (req, res) => {
      const { id } = req.params;
      console.log('Request ID:', id)

      try {
        const requestDetails = await donationRequestCollection.findOne(id);
        if (requestDetails) {
          res.status(200).json(requestDetails);
        } else {
          res.status(404).json({ message: 'Donation request not found' });
        }
      } catch (error) {
        res.status(500).json({ message: 'Error fetching donation request details', error });
      }
    });

    // Update Donation Request Status
    app.patch('/donation-requests/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!['done', 'canceled'].includes(status)) {
        return res.status(400).send({ message: 'Invalid status update' });
      }

      const result = await donationRequestCollection.updateOne(
        { _id: new ObjectId(id), donationStatus: 'inprogress' },
        { $set: { donationStatus: status } }
      );

      if (result.matchedCount === 0) {
        const donationRequest = await donationRequestCollection.findOne({ _id: new ObjectId(id) });
        if (!donationRequest) {
          return res.status(404).send({ message: 'Donation request not found' });
        }
        return res.status(400).send({ message: 'Cannot update donation request in current status' });
      }

      res.send({ message: 'Donation request updated successfully' });
    });

    // Delete Donation Request
    app.delete('/donation-requests/:id', async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) }

      const result = await donationRequestCollection.deleteOne(query);

      if (result.deletedCount === 0) {
        return res.status(404).send({ message: 'Donation request not found' });
      }

      res.send({ message: 'Donation request deleted successfully' });
    });

    // Fetch user's donation requests with filtering and pagination
    app.get("/my-donation-requests", async (req, res) => {
      try {
        const { email, status, page = 1, limit = 10 } = req.query;

        if (!email) {
          return res.status(400).json({ message: "User email is required." });
        }

        const filter = { requesterEmail: email };
        if (status) {
          filter.donationStatus = status;
        }

        const skip = (page - 1) * limit;
        const requests = await donationCollection.find(filter)
          .skip(skip)
          .limit(parseInt(limit))
          .sort({ createdAt: -1 }); // Sort by latest

        const totalRequests = await donationCollection.countDocuments(filter);

        res.status(200).json({
          data: requests,
          currentPage: parseInt(page),
          totalPages: Math.ceil(totalRequests / limit),
          totalRequests,
        });
      } catch (error) {
        console.error("Error fetching donation requests:", error);
        res.status(500).json({ message: "Internal server error." });
      }
    });


    // Get All Users with Pagination and Filtering
    app.get("/users", async (req, res) => {
      try {
        const { status, page = 1, limit = 10 } = req.query;

        const query = status ? { status } : {};
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const totalUsers = await userCollection.countDocuments(query);
        const users = await userCollection
          .find(query)
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          totalUsers,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalUsers / limit),
          users,
        });
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch users", error });
      }
    });

    // Update User Status (Block/Unblock)
    app.patch("/users/:id/status", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!["active", "blocked"].includes(status)) {
          return res.status(400).send({ message: "Invalid status" });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ message: `User status updated to ${status}` });
      } catch (error) {
        res.status(500).send({ message: "Failed to update user status", error });
      }
    });

    // Update User Role
    app.patch("/users/:id/role", async (req, res) => {
      try {
        const { id } = req.params;
        const { role } = req.body;

        if (!["donor", "volunteer", "admin"].includes(role)) {
          return res.status(400).send({ message: "Invalid role" });
        }

        const result = await userCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { role } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: "User not found" });
        }

        res.send({ message: `User role updated to ${role}` });
      } catch (error) {
        res.status(500).send({ message: "Failed to update user role", error });
      }
    });


    // All Blood Donation Request


    app.get('/all-donation-requests', async (req, res) => {
      const { page = 1, limit = 10, status } = req.query;

      try {
        const query = {};
        if (status) {
          query.donationStatus = status;
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);
        const totalRequests = await donationRequestCollection.countDocuments(query);
        const requests = await donationRequestCollection
          .find(query)
          .sort({ createdAt: -1 }) // Sort by most recent
          .skip(skip)
          .limit(parseInt(limit))
          .toArray();

        res.send({
          totalRequests,
          page: parseInt(page),
          limit: parseInt(limit),
          totalPages: Math.ceil(totalRequests / limit),
          requests,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to fetch donation requests' });
      }
    });

    app.patch('/donation-requests/:id/status', async (req, res) => {
      const { id } = req.params;
      const { status } = req.body;

      if (!['done', 'canceled', 'pending', 'inprogress'].includes(status)) {
        return res.status(400).send({ message: 'Invalid status update' });
      }

      try {
        const result = await donationRequestCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { donationStatus: status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Donation request not found' });
        }

        res.send({ message: 'Donation request status updated successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to update donation request status' });
      }
    });

    app.delete('/donation-requests/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await donationRequestCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Donation request not found' });
        }

        res.send({ message: 'Donation request deleted successfully' });
      } catch (error) {
        console.error(error);
        res.status(500).send({ message: 'Failed to delete donation request' });
      }
    });



    // Create a new blog
    app.post('/content-management/blog', async (req, res) => {
      const { title, thumbnail, content, createdBy } = req.body;

      try {
        const newBlog = {
          title,
          thumbnail,
          content,
          createdBy,
          status: 'draft',
          createdAt: new Date(),
        };

        const result = await blogCollection.insertOne(newBlog);
        res.status(201).send({
          message: 'Blog created successfully',
          blogId: result.insertedId,
        });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to create blog' });
      }
    });

    // Get all blogs with optional filtering
    app.get('/content-management/blogs', async (req, res) => {
      const { status } = req.query;

      try {
        const query = status ? { status } : {}; // Filter by status if provided
        const blogs = await blogCollection.find(query).toArray();
        res.send(blogs);
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to fetch blogs' });
      }
    });

    // Publish a blog (only admin can do this)
    app.patch('/content-management/blogs/:id/publish', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await blogCollection.updateOne(
          { _id: new ObjectId(id), status: 'draft' },
          { $set: { status: 'published' } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Blog not found or already published' });
        }

        res.send({ message: 'Blog published successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to publish blog' });
      }
    });

    // Unpublish a blog (only admin can do this)
    app.patch('/content-management/blogs/:id/unpublish', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await blogCollection.updateOne(
          { _id: new ObjectId(id), status: 'published' },
          { $set: { status: 'draft' } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ message: 'Blog not found or already unpublished' });
        }

        res.send({ message: 'Blog unpublished successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to unpublish blog' });
      }
    });

    // Delete a blog (only admin can do this)
    app.delete('/content-management/blogs/:id', async (req, res) => {
      const { id } = req.params;

      try {
        const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });

        if (result.deletedCount === 0) {
          return res.status(404).send({ message: 'Blog not found' });
        }

        res.send({ message: 'Blog deleted successfully' });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to delete blog' });
      }
    });



    // Get all pending donation requests
    app.get('/pending', async (req, res) => {
      try {
        const requests = await donationCollection.find({ status: 'pending' });
        res.status(200).json(requests);
      } catch (error) {
        res.status(500).json({ error: 'Failed to fetch donation requests' });
      }
    });

    // Get a specific donation request by ID
    app.get("/donation-requests/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const request = await donationCollection.findOne({ _id: new ObjectId(id) });
        if (request) {
          res.send(request);
        } else {
          res.status(404).send({ message: "Donation request not found." });
        }
      } catch (error) {
        res.status(500).send({ message: "Failed to fetch the donation request.", error });
      }
    });





    // get single user with user email
    app.get('/user/:email', async (req, res) => {
      const { email } = req.params;

      try {
        const result = await userCollection.findOne({ email: email });



        res.send({ message: 'get user success', data: result });
      } catch (err) {
        console.error(err);
        res.status(500).send({ message: 'Failed to get user' });
      }
    });



    console.log('Connected to MongoDB successfully!');
  } finally {
    // Uncomment this line to close the connection when the server stops
    // await client.close();
  }
}

run().catch(console.dir);

app.get('/', (req, res) => {
  res.send('Server is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});










